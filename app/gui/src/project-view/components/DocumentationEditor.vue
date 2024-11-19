<script setup lang="ts">
import { documentationEditorBindings } from '@/bindings'
import FullscreenButton from '@/components/FullscreenButton.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { fetcherUrlTransformer } from '@/components/MarkdownEditor/imageUrlTransformer'
import WithFullscreenMode from '@/components/WithFullscreenMode.vue'
import { useGraphStore } from '@/stores/graph'
import { useProjectStore } from '@/stores/project'
import { useProjectFiles } from '@/stores/projectFiles'
import { Vec2 } from '@/util/data/vec2'
import type { ToValue } from '@/util/reactivity'
import { useToast } from '@/util/toast'
import { ComponentInstance, computed, reactive, ref, toRef, toValue, watch } from 'vue'
import type { Path, Uuid } from 'ydoc-shared/languageServerTypes'
import { Err, Ok, mapOk, withContext, type Result } from 'ydoc-shared/util/data/result'
import * as Y from 'yjs'

const { yText } = defineProps<{
  yText: Y.Text
}>()
const emit = defineEmits<{
  'update:fullscreen': [boolean]
}>()

const toolbarElement = ref<HTMLElement>()
const markdownEditor = ref<ComponentInstance<typeof MarkdownEditor>>()

const graphStore = useGraphStore()
const projectStore = useProjectStore()
const { transformImageUrl, uploadImage } = useDocumentationImages(
  toRef(graphStore, 'modulePath'),
  useProjectFiles(projectStore),
)
const uploadErrorToast = useToast.error()

type UploadedImagePosition = { type: 'selection' } | { type: 'coords'; coords: Vec2 }

/**
 * A Project File management API for {@link useDocumentationImages} composable.
 */
interface ProjectFilesAPI {
  projectRootId: Promise<Uuid | undefined>
  readFileBinary(path: Path): Promise<Result<Blob>>
  writeFileBinary(path: Path, content: Blob): Promise<Result>
  pickUniqueName(path: Path, suggestedName: string): Promise<Result<string>>
  ensureDirExists(path: Path): Promise<Result<void>>
}

function useDocumentationImages(
  modulePath: ToValue<Path | undefined>,
  projectFiles: ProjectFilesAPI,
) {
  function urlToPath(url: string): Result<Path> | undefined {
    const modulePathValue = toValue(modulePath)
    if (!modulePathValue) {
      return Err('Current module path is unknown.')
    }
    const appliedUrl = new URL(url, `file:///${modulePathValue.segments.join('/')}`)
    if (appliedUrl.protocol === 'file:') {
      // The pathname starts with '/', so we remove "" segment.
      const segments = decodeURI(appliedUrl.pathname).split('/').slice(1)
      return Ok({ rootId: modulePathValue.rootId, segments })
    } else {
      // Not a relative URL, custom fetching not needed.
      return undefined
    }
  }

  function pathUniqueId(path: Path) {
    return path.rootId + ':' + path.segments.join('/')
  }

  function pathDebugRepr(path: Path) {
    return pathUniqueId(path)
  }

  const currentlyUploading = reactive(new Map<string, Promise<Blob>>())

  const transformImageUrl = fetcherUrlTransformer(
    async (url: string) => {
      const path = await urlToPath(url)
      if (!path) return
      return withContext(
        () => `Locating documentation image (${url})`,
        () =>
          mapOk(path, (path) => {
            const id = pathUniqueId(path)
            return {
              location: path,
              uniqueId: id,
              uploading: computed(() => currentlyUploading.has(id)),
            }
          }),
      )
    },
    async (path) => {
      return withContext(
        () => `Loading documentation image (${pathDebugRepr(path)})`,
        async () => {
          const uploaded = await currentlyUploading.get(pathUniqueId(path))
          return uploaded ? Ok(uploaded) : projectFiles.readFileBinary(path)
        },
      )
    },
  )

  async function uploadImage(
    name: string,
    blobPromise: Promise<Blob>,
    position: UploadedImagePosition = { type: 'selection' },
  ) {
    const rootId = await projectFiles.projectRootId
    if (!rootId) {
      uploadErrorToast.show('Cannot upload image: unknown project file tree root.')
      return
    }
    if (!markdownEditor.value || !markdownEditor.value.loaded) {
      console.error('Tried to upload image while mardown editor is still not loaded')
      return
    }
    const dirPath = { rootId, segments: ['images'] }
    await projectFiles.ensureDirExists(dirPath)
    const filename = await projectFiles.pickUniqueName(dirPath, name)
    if (!filename.ok) {
      uploadErrorToast.reportError(filename.error)
      return
    }
    const path: Path = { rootId, segments: ['images', filename.value] }
    const id = pathUniqueId(path)
    currentlyUploading.set(id, blobPromise)

    const insertedLink = `\n![Image](/images/${encodeURI(filename.value)})\n`
    switch (position.type) {
      case 'selection':
        markdownEditor.value.putText(insertedLink)
        break
      case 'coords':
        markdownEditor.value.putTextAtCoord(insertedLink, position.coords)
        break
    }
    try {
      const blob = await blobPromise
      const uploadResult = await projectFiles.writeFileBinary(path, blob)
      if (!uploadResult.ok)
        uploadErrorToast.reportError(uploadResult.error, 'Failed to upload image')
    } finally {
      currentlyUploading.delete(id)
    }
  }

  return { transformImageUrl, uploadImage }
}

const fullscreen = ref(false)
const fullscreenAnimating = ref(false)

watch(
  () => fullscreen.value || fullscreenAnimating.value,
  (fullscreenOrAnimating) => emit('update:fullscreen', fullscreenOrAnimating),
)

const supportedImageTypes: Record<string, { extension: string }> = {
  // List taken from https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
  'image/apng': { extension: 'apng' },
  'image/avif': { extension: 'avif' },
  'image/gif': { extension: 'gif' },
  'image/jpeg': { extension: 'jpg' },
  'image/png': { extension: 'png' },
  'image/svg+xml': { extension: 'svg' },
  'image/webp': { extension: 'webp' },
  // Question: do we want to have BMP and ICO here?
}

async function handleFileDrop(event: DragEvent) {
  if (!event.dataTransfer?.items) return
  for (const item of event.dataTransfer.items) {
    if (item.kind !== 'file' || !Object.hasOwn(supportedImageTypes, item.type)) continue
    const file = item.getAsFile()
    if (!file) continue
    const clientPos = new Vec2(event.clientX, event.clientY)
    event.stopPropagation()
    event.preventDefault()
    await uploadImage(file.name, Promise.resolve(file), { type: 'coords', coords: clientPos })
  }
}

const handler = documentationEditorBindings.handler({
  paste: () => {
    window.navigator.clipboard.read().then(async (items) => {
      if (markdownEditor.value == null) return
      for (const item of items) {
        const textType = item.types.find((type) => type === 'text/plain')
        if (textType) {
          const blob = await item.getType(textType)
          markdownEditor.value.putText(await blob.text())
          break
        }
        const imageType = item.types.find((type) => type in supportedImageTypes)
        if (imageType) {
          const ext = supportedImageTypes[imageType]?.extension ?? ''
          uploadImage(`image.${ext}`, item.getType(imageType)).catch((err) =>
            uploadErrorToast.show(`Failed to upload image: ${err}`),
          )
          break
        }
      }
    })
  },
})
</script>

<template>
  <WithFullscreenMode :fullscreen="fullscreen" @update:animating="fullscreenAnimating = $event">
    <div class="DocumentationEditor">
      <div ref="toolbarElement" class="toolbar">
        <FullscreenButton v-model="fullscreen" />
      </div>
      <div
        class="scrollArea"
        @keydown="handler"
        @dragover.prevent
        @drop.prevent="handleFileDrop($event)"
      >
        <MarkdownEditor
          ref="markdownEditor"
          :yText="yText"
          :transformImageUrl="transformImageUrl"
          :toolbarContainer="toolbarElement"
        />
      </div>
    </div>
  </WithFullscreenMode>
</template>

<style scoped>
.DocumentationEditor {
  display: flex;
  flex-direction: column;
  background-color: #fff;
  height: 100%;
  width: 100%;
}

.scrollArea {
  width: 100%;
  overflow-y: auto;
  padding-left: 10px;
  /* Prevent touchpad back gesture, which can be triggered while panning. */
  overscroll-behavior-x: none;
  flex-grow: 1;
}

.toolbar {
  height: 48px;
  padding-left: 16px;
  flex-shrink: 0;

  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 8px;
}
</style>
