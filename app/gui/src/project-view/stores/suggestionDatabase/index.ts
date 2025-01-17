import { createContextStore } from '@/providers'
import { type ProjectStore } from '@/stores/project'
import {
  entryIsCallable,
  SuggestionKind,
  type CallableSuggestionEntry,
  type SuggestionEntry,
  type SuggestionId,
} from '@/stores/suggestionDatabase/entry'
import { SuggestionUpdateProcessor } from '@/stores/suggestionDatabase/lsUpdate'
import { ReactiveDb, ReactiveIndex } from '@/util/database/reactiveDb'
import { AsyncQueue } from '@/util/net'
import {
  normalizeQualifiedName,
  qnJoin,
  qnParent,
  tryQualifiedName,
  type QualifiedName,
} from '@/util/qualifiedName'
import { markRaw, proxyRefs, readonly, ref } from 'vue'
import { LanguageServer } from 'ydoc-shared/languageServer'
import type { MethodPointer } from 'ydoc-shared/languageServerTypes'
import * as lsTypes from 'ydoc-shared/languageServerTypes/suggestions'
import { exponentialBackoff } from 'ydoc-shared/util/net'

/**
 * Suggestion Database.
 *
 * The entries are retrieved (and updated) from engine through the Language Server API. They represent
 * all entities available in current project (from the project and all imported libraries).
 *
 * It is used for code completion/component browser suggestions (thence the name), but also for
 * retrieving information about method/function in widgets, and many more.
 */
export class SuggestionDb extends ReactiveDb<SuggestionId, SuggestionEntry> {
  nameToId = new ReactiveIndex(this, (id, entry) => [[entry.definitionPath, id]])
  childIdToParentId = new ReactiveIndex(this, (id, entry) => {
    const qualifiedName = qnParent(entry.definitionPath)
    if (qualifiedName) {
      const parents = this.nameToId.lookup(qualifiedName)
      return Array.from(parents, (p) => [id, p])
    }
    return []
  })
  conflictingNames = new ReactiveIndex(this, (id, entry) => [[entry.name, id]])

  /** Get entry by its fully qualified name */
  getEntryByQualifiedName(name: QualifiedName): SuggestionEntry | undefined {
    const [id] = this.nameToId.lookup(name)
    if (id) {
      return this.get(id)
    }
  }

  /** Get ID of method/function by MethodPointer structure (received through expression updates). */
  findByMethodPointer(method: MethodPointer): SuggestionId | undefined {
    if (method == null) return
    const moduleName = tryQualifiedName(method.definedOnType)
    const methodName = tryQualifiedName(method.name)
    if (!moduleName.ok || !methodName.ok) return
    const qualifiedName = qnJoin(normalizeQualifiedName(moduleName.value), methodName.value)
    const [suggestionId] = this.nameToId.lookup(qualifiedName)
    return suggestionId
  }

  /** Get entry of method/function by MethodPointer structure (received through expression updates). */
  entryByMethodPointer(method: MethodPointer): CallableSuggestionEntry | undefined {
    const id = this.findByMethodPointer(method)
    if (id == null) return
    const entry = this.get(id)
    return entry && entryIsCallable(entry) ? entry : undefined
  }

  /** Returns the entry's ancestors, starting with its parent. */
  *ancestors(entry: SuggestionEntry): Iterable<QualifiedName> {
    while (entry.kind === SuggestionKind.Type && entry.parentType != null) {
      yield entry.parentType
      const parent = this.getEntryByQualifiedName(entry.parentType)
      if (!parent) break
      entry = parent
    }
  }
}

/**
 * Component Group.
 *
 * These are groups displayed in the Component Browser. Also, nodes being a call to method from
 * given group will inherit its color.
 */
export interface Group {
  color?: string
  name: string
  project: QualifiedName
}

class Synchronizer {
  queue: AsyncQueue<{ currentVersion: number }>

  constructor(
    projectStore: ProjectStore,
    public entries: SuggestionDb,
    updateProcessor: Promise<SuggestionUpdateProcessor>,
  ) {
    const lsRpc = projectStore.lsRpcConnection
    const initState = exponentialBackoff(() =>
      lsRpc.acquireCapability('search/receivesSuggestionsDatabaseUpdates', {}),
    ).then(async (capability) => {
      if (!capability.ok) {
        capability.error.log('Will not receive database updates')
      }
      this.#setupUpdateHandler(lsRpc, await updateProcessor)
      return Synchronizer.loadDatabase(entries, lsRpc, await updateProcessor)
    })

    this.queue = new AsyncQueue(initState)
  }

  static async loadDatabase(
    entries: SuggestionDb,
    lsRpc: LanguageServer,
    updateProcessor: SuggestionUpdateProcessor,
  ): Promise<{ currentVersion: number }> {
    const initialDb = await exponentialBackoff(() => lsRpc.getSuggestionsDatabase())
    if (!initialDb.ok) {
      initialDb.error.log(
        'Cannot load initial suggestion database. Continuing with empty suggestion database',
      )
      return { currentVersion: 0 }
    }
    for (const lsEntry of initialDb.value.entries) {
      const entry = updateProcessor.entryFromLs(lsEntry.suggestion)
      if (!entry.ok) {
        entry.error.log()
        console.error(`Skipping entry ${lsEntry.id}, the suggestion database will be incomplete!`)
      } else {
        entries.set(lsEntry.id, entry.value)
      }
    }
    return { currentVersion: initialDb.value.currentVersion }
  }

  #setupUpdateHandler(lsRpc: LanguageServer, updateProcessor: SuggestionUpdateProcessor) {
    lsRpc.on('search/suggestionsDatabaseUpdates', (param) => {
      this.queue.pushTask(async ({ currentVersion }) => {
        // There are rare cases where the database is updated twice in quick succession, with the
        // second update containing the same version as the first. In this case, we still need to
        // apply the second set of updates. Skipping it would result in the database then containing
        // references to entries that don't exist. This might be an engine issue, but accepting the
        // second updates seems to be harmless, so we do that.
        if (param.currentVersion == currentVersion) {
          console.log(
            `Received multiple consecutive suggestion database updates with version ${param.currentVersion}`,
          )
        }

        if (param.currentVersion < currentVersion) {
          console.log(
            `Skipping suggestion database update ${param.currentVersion}, because it's already applied`,
          )
          return { currentVersion }
        } else {
          updateProcessor.applyUpdates(this.entries, param.updates)
          return { currentVersion: param.currentVersion }
        }
      })
    })
  }
}

async function loadGroups(lsRpc: LanguageServer, firstExecution: Promise<unknown>) {
  await firstExecution
  const groups = await exponentialBackoff(() => lsRpc.getComponentGroups())
  if (!groups.ok) {
    if (!lsRpc.isDisposed) {
      groups.error.log('Cannot read component groups. Continuing without groups')
    }
    return []
  }
  return groups.value.componentGroups.map(
    (group): Group => ({
      name: group.name,
      ...(group.color ? { color: group.color } : {}),
      project: group.library as QualifiedName,
    }),
  )
}

/** {@link useSuggestionDbStore} composable object */
export type SuggestionDbStore = ReturnType<typeof useSuggestionDbStore>
export const [provideSuggestionDbStore, useSuggestionDbStore] = createContextStore(
  'suggestionDatabase',
  (projectStore: ProjectStore) => {
    const entries = new SuggestionDb()
    const groups = ref<Group[]>([])

    const updateProcessor = loadGroups(
      projectStore.lsRpcConnection,
      projectStore.firstExecution,
    ).then((loadedGroups) => {
      groups.value = loadedGroups
      return new SuggestionUpdateProcessor(loadedGroups)
    })

    /** Add an entry to the suggestion database. */
    function mockSuggestion(entry: lsTypes.SuggestionEntry) {
      const id = Math.max(...entries.nameToId.reverse.keys()) + 1
      new SuggestionUpdateProcessor([]).applyUpdates(entries, [
        {
          type: 'Add',
          id,
          suggestion: entry,
        },
      ])
    }

    const _synchronizer = new Synchronizer(projectStore, entries, updateProcessor)
    return proxyRefs({
      entries: markRaw(entries),
      groups: readonly(groups),
      _synchronizer,
      mockSuggestion,
    })
  },
)
