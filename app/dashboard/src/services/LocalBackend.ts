/** @file Module containing the API client for the local backend API.
 *
 * Each exported function in the {@link LocalBackend} in this module corresponds to an API endpoint.
 * The functions are asynchronous and return a {@link Promise} that resolves to the response from
 * the API. */
import Backend, * as backend from '#/services/Backend'
import * as projectManager from '#/services/ProjectManager'
import type ProjectManager from '#/services/ProjectManager'

import * as appBaseUrl from '#/utilities/appBaseUrl'
import * as dateTime from '#/utilities/dateTime'
import * as download from '#/utilities/download'
import * as errorModule from '#/utilities/error'
import * as fileInfo from '#/utilities/fileInfo'

// =============================
// === ipWithSocketToAddress ===
// =============================

/** Convert a {@link projectManager.IpWithSocket} to a {@link backend.Address}. */
function ipWithSocketToAddress(ipWithSocket: projectManager.IpWithSocket) {
  return backend.Address(`ws://${ipWithSocket.host}:${ipWithSocket.port}`)
}

// ======================================
// === Functions for manipulating ids ===
// ======================================

/** Create a {@link backend.DirectoryId} from a path. */
export function newDirectoryId(path: projectManager.Path) {
  return backend.DirectoryId(`${backend.AssetType.directory}-${path}`)
}

/** Create a {@link backend.ProjectId} from a UUID. */
export function newProjectId(uuid: projectManager.UUID) {
  return backend.ProjectId(`${backend.AssetType.project}-${uuid}`)
}

/** Create a {@link backend.FileId} from a path. */
export function newFileId(path: projectManager.Path) {
  return backend.FileId(`${backend.AssetType.file}-${path}`)
}

/** The internal asset type and properly typed corresponding internal ID of a directory. */
interface DirectoryTypeAndId {
  readonly type: backend.AssetType.directory
  readonly id: projectManager.Path
}

/** The internal asset type and properly typed corresponding internal ID of a project. */
interface ProjectTypeAndId {
  readonly type: backend.AssetType.project
  readonly id: projectManager.UUID
}

/** The internal asset type and properly typed corresponding internal ID of a file. */
interface FileTypeAndId {
  readonly type: backend.AssetType.file
  readonly id: projectManager.Path
}

/** The internal asset type and properly typed corresponding internal ID of an arbitrary asset. */
type AssetTypeAndId<Id extends backend.AssetId = backend.AssetId> =
  | (backend.DirectoryId extends Id ? DirectoryTypeAndId : never)
  | (backend.FileId extends Id ? FileTypeAndId : never)
  | (backend.ProjectId extends Id ? ProjectTypeAndId : never)

export function extractTypeAndId<Id extends backend.AssetId>(id: Id): AssetTypeAndId<Id>
/** Extracts the asset type and its corresponding internal ID from a {@link backend.AssetId}.
 * @throws {Error} if the id has an unknown type. */
export function extractTypeAndId<Id extends backend.AssetId>(id: Id): AssetTypeAndId {
  const [, typeRaw, idRaw = ''] = id.match(/(.+?)-(.+)/) ?? []
  switch (typeRaw) {
    case backend.AssetType.directory: {
      return { type: backend.AssetType.directory, id: projectManager.Path(idRaw) }
    }
    case backend.AssetType.project: {
      return { type: backend.AssetType.project, id: projectManager.UUID(idRaw) }
    }
    case backend.AssetType.file: {
      return { type: backend.AssetType.file, id: projectManager.Path(idRaw) }
    }
    default: {
      throw new Error(`Invalid type '${typeRaw}'`)
    }
  }
}

// ====================
// === LocalBackend ===
// ====================

/** Class for sending requests to the Project Manager API endpoints.
 * This is used instead of the cloud backend API when managing local projects from the dashboard. */
export default class LocalBackend extends Backend {
  readonly type = backend.BackendType.local
  private readonly projectManager: ProjectManager

  /** Create a {@link LocalBackend}. */
  constructor(projectManagerInstance: ProjectManager) {
    super()

    this.projectManager = projectManagerInstance
  }

  /** Get the root directory of this Backend as a path. */
  get rootPath() {
    return this.projectManager.rootDirectory
  }

  /** Set the root directory of this Backend as a path. */
  set rootPath(value) {
    this.projectManager.rootDirectory = value
  }

  /** Return the ID of the root directory. */
  override rootDirectoryId(): backend.DirectoryId {
    return newDirectoryId(this.projectManager.rootDirectory)
  }

  /** Return a list of assets in a directory.
   * @throws An error if the JSON-RPC call fails. */
  override async listDirectory(
    query: backend.ListDirectoryRequestParams
  ): Promise<backend.AnyAsset[]> {
    const parentIdRaw = query.parentId == null ? null : extractTypeAndId(query.parentId).id
    const parentId = query.parentId ?? newDirectoryId(this.projectManager.rootDirectory)
    // Check if Root Directory Exists
    if (
      parentIdRaw == null &&
      !(await this.projectManager.exists(this.projectManager.rootDirectory))
    ) {
      await this.projectManager.createDirectory(this.projectManager.rootDirectory)
      return []
    } else {
      const entries = await this.projectManager.listDirectory(parentIdRaw)
      return entries
        .map(entry => {
          switch (entry.type) {
            case projectManager.FileSystemEntryType.DirectoryEntry: {
              return {
                type: backend.AssetType.directory,
                id: newDirectoryId(entry.path),
                modifiedAt: entry.attributes.lastModifiedTime,
                parentId,
                title: fileInfo.fileName(entry.path),
                permissions: [],
                projectState: null,
                labels: [],
                description: null,
              } satisfies backend.DirectoryAsset
            }
            case projectManager.FileSystemEntryType.ProjectEntry: {
              return {
                type: backend.AssetType.project,
                id: newProjectId(entry.metadata.id),
                title: entry.metadata.name,
                modifiedAt: entry.metadata.lastOpened ?? entry.metadata.created,
                parentId,
                permissions: [],
                projectState: {
                  type:
                    this.projectManager.projects.get(entry.metadata.id)?.state ??
                    backend.ProjectState.closed,
                  volumeId: '',
                },
                labels: [],
                description: null,
              } satisfies backend.ProjectAsset
            }
            case projectManager.FileSystemEntryType.FileEntry: {
              return {
                type: backend.AssetType.file,
                id: newFileId(entry.path),
                title: fileInfo.fileName(entry.path),
                modifiedAt: entry.attributes.lastModifiedTime,
                parentId,
                permissions: [],
                projectState: null,
                labels: [],
                description: null,
              } satisfies backend.FileAsset
            }
          }
        })
        .sort(backend.compareAssets)
    }
  }

  /** Return a list of projects belonging to the current user.
   * @throws An error if the JSON-RPC call fails. */
  override async listProjects(): Promise<backend.ListedProject[]> {
    const result = await this.projectManager.listProjects({})
    return result.projects.map(project => ({
      name: project.name,
      organizationId: backend.OrganizationId(''),
      projectId: newProjectId(project.id),
      packageName: project.name,
      state: {
        type: backend.ProjectState.closed,
        volumeId: '',
      },
      jsonAddress: null,
      binaryAddress: null,
    }))
  }

  /** Create a project.
   * @throws An error if the JSON-RPC call fails. */
  override async createProject(
    body: backend.CreateProjectRequestBody
  ): Promise<backend.CreatedProject> {
    const projectsDirectory =
      body.parentDirectoryId == null ? null : extractTypeAndId(body.parentDirectoryId).id
    const project = await this.projectManager.createProject({
      name: projectManager.ProjectName(body.projectName),
      ...(body.projectTemplateName != null ? { projectTemplate: body.projectTemplateName } : {}),
      missingComponentAction: projectManager.MissingComponentAction.install,
      ...(projectsDirectory == null ? {} : { projectsDirectory }),
    })
    return {
      name: project.projectName,
      organizationId: backend.OrganizationId(''),
      projectId: newProjectId(project.projectId),
      packageName: project.projectName,
      state: { type: backend.ProjectState.closed, volumeId: '' },
    }
  }

  /** Close the project identified by the given project ID.
   * @throws An error if the JSON-RPC call fails. */
  override async closeProject(projectId: backend.ProjectId, title: string | null): Promise<void> {
    const { id } = extractTypeAndId(projectId)
    try {
      const state = this.projectManager.projects.get(id)
      if (state?.state === backend.ProjectState.openInProgress) {
        // Projects that are not opened cannot be closed.
        // This is the only way to wait until the project is open.
        await this.projectManager.openProject({
          projectId: id,
          missingComponentAction: projectManager.MissingComponentAction.install,
        })
      }
      await this.projectManager.closeProject({ projectId: id })
      return
    } catch (error) {
      throw new Error(
        `Could not close project ${title != null ? `'${title}'` : `with ID '${projectId}'`}: ${
          errorModule.tryGetMessage(error) ?? 'unknown error'
        }.`
      )
    }
  }

  /** Close the project identified by the given project ID.
   * @throws An error if the JSON-RPC call fails. */
  override async getProjectDetails(
    projectId: backend.ProjectId,
    directory: backend.DirectoryId | null,
    title: string
  ): Promise<backend.Project> {
    const { id } = extractTypeAndId(projectId)
    const state = this.projectManager.projects.get(id)
    if (state == null) {
      const directoryId = directory == null ? null : extractTypeAndId(directory).id
      const entries = await this.projectManager.listDirectory(directoryId)
      const project = entries
        .flatMap(entry =>
          entry.type === projectManager.FileSystemEntryType.ProjectEntry ? [entry.metadata] : []
        )
        .find(metadata => metadata.id === id)
      if (project == null) {
        throw new Error(`Could not get details of project '${title}'.`)
      } else {
        const version =
          project.engineVersion == null
            ? null
            : {
                lifecycle: backend.detectVersionLifecycle(project.engineVersion),
                value: project.engineVersion,
              }
        return {
          name: project.name,
          engineVersion: version,
          ideVersion: version,
          jsonAddress: null,
          binaryAddress: null,
          organizationId: backend.OrganizationId(''),
          packageName: project.name,
          projectId,
          state: { type: backend.ProjectState.closed, volumeId: '' },
        }
      }
    } else {
      const cachedProject = await state.data
      return {
        name: cachedProject.projectName,
        engineVersion: {
          lifecycle: backend.detectVersionLifecycle(cachedProject.engineVersion),
          value: cachedProject.engineVersion,
        },
        ideVersion: {
          lifecycle: backend.detectVersionLifecycle(cachedProject.engineVersion),
          value: cachedProject.engineVersion,
        },
        jsonAddress: ipWithSocketToAddress(cachedProject.languageServerJsonAddress),
        binaryAddress: ipWithSocketToAddress(cachedProject.languageServerBinaryAddress),
        organizationId: backend.OrganizationId(''),
        packageName: cachedProject.projectNormalizedName,
        projectId,
        state: {
          type: backend.ProjectState.opened,
          volumeId: '',
        },
      }
    }
  }

  /** Prepare a project for execution.
   * @throws An error if the JSON-RPC call fails. */
  override async openProject(
    projectId: backend.ProjectId,
    body: backend.OpenProjectRequestBody | null,
    title: string | null
  ): Promise<void> {
    const { id } = extractTypeAndId(projectId)
    try {
      await this.projectManager.openProject({
        projectId: id,
        missingComponentAction: projectManager.MissingComponentAction.install,
        ...(body?.parentId != null
          ? { projectsDirectory: extractTypeAndId(body.parentId).id }
          : {}),
      })
      return
    } catch (error) {
      throw new Error(
        `Could not open project ${title != null ? `'${title}'` : `with ID '${projectId}'`}: ${
          errorModule.tryGetMessage(error) ?? 'unknown error'
        }.`
      )
    }
  }

  /** Change the name of a project.
   * @throws An error if the JSON-RPC call fails. */
  override async updateProject(
    projectId: backend.ProjectId,
    body: backend.UpdateProjectRequestBody
  ): Promise<backend.UpdatedProject> {
    if (body.ami != null) {
      throw new Error('Cannot change project AMI on local backend.')
    } else {
      const { id } = extractTypeAndId(projectId)
      if (body.projectName != null) {
        await this.projectManager.renameProject({
          projectId: id,
          name: projectManager.ProjectName(body.projectName),
        })
      }
      const parentId = this.projectManager.getProjectDirectoryPath(id)
      const result = await this.projectManager.listDirectory(parentId)
      const project = result.flatMap(listedProject =>
        listedProject.type === projectManager.FileSystemEntryType.ProjectEntry &&
        listedProject.metadata.id === id
          ? [listedProject.metadata]
          : []
      )[0]
      const version =
        project?.engineVersion == null
          ? null
          : {
              lifecycle: backend.detectVersionLifecycle(project.engineVersion),
              value: project.engineVersion,
            }
      if (project == null) {
        throw new Error(`The project ID '${projectId}' is invalid.`)
      } else {
        return {
          ami: null,
          engineVersion: version,
          ideVersion: version,
          name: project.name,
          organizationId: backend.OrganizationId(''),
          projectId,
        }
      }
    }
  }

  /** Duplicate a specific version of a project. */
  override async duplicateProject(projectId: backend.ProjectId): Promise<backend.CreatedProject> {
    const id = extractTypeAndId(projectId).id
    const project = await this.projectManager.duplicateProject({ projectId: id })
    return {
      projectId: newProjectId(project.projectId),
      name: project.projectName,
      packageName: project.projectNormalizedName,
      organizationId: backend.OrganizationId(''),
      state: { type: backend.ProjectState.closed, volumeId: '' },
    }
  }

  /** Delete an arbitrary asset.
   * @throws An error if the JSON-RPC call fails. */
  override async deleteAsset(
    assetId: backend.AssetId,
    _body: backend.DeleteAssetRequestBody,
    title: string | null
  ): Promise<void> {
    const typeAndId = extractTypeAndId(assetId)
    switch (typeAndId.type) {
      case backend.AssetType.directory:
      case backend.AssetType.file: {
        await this.projectManager.deleteFile(typeAndId.id)
        return
      }
      case backend.AssetType.project: {
        try {
          await this.projectManager.deleteProject({ projectId: typeAndId.id })
          return
        } catch (error) {
          throw new Error(
            `Could not delete project ${
              title != null ? `'${title}'` : `with ID '${typeAndId.id}'`
            }: ${errorModule.tryGetMessage(error) ?? 'unknown error'}.`
          )
        }
      }
    }
  }

  /** Copy an arbitrary asset to another directory. */
  override async copyAsset(
    assetId: backend.AssetId,
    parentDirectoryId: backend.DirectoryId
  ): Promise<backend.CopyAssetResponse> {
    const typeAndId = extractTypeAndId(assetId)
    if (typeAndId.type !== backend.AssetType.project) {
      throw new Error('Only projects can be copied on the Local Backend.')
    } else {
      const project = await this.projectManager.duplicateProject({ projectId: typeAndId.id })
      const projectPath = this.projectManager.projectPaths.get(typeAndId.id)
      const parentPath =
        projectPath == null ? null : projectManager.getDirectoryAndName(projectPath).directoryPath
      if (parentPath !== extractTypeAndId(parentDirectoryId).id) {
        throw new Error('Cannot duplicate project to a different directory on the Local Backend.')
      } else {
        const asset = {
          id: newProjectId(project.projectId),
          parentId: parentDirectoryId,
          title: project.projectName,
        }
        return { asset }
      }
    }
  }

  /** Return a list of engine versions. */
  override async listVersions(params: backend.ListVersionsRequestParams) {
    const engineVersions = await this.projectManager.listAvailableEngineVersions()
    const engineVersionToVersion = (version: projectManager.EngineVersion): backend.Version => ({
      ami: null,
      created: dateTime.toRfc3339(new Date()),
      number: {
        value: version.version,
        lifecycle: backend.detectVersionLifecycle(version.version),
      },
      // The names come from a third-party API and cannot be changed.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      version_type: params.versionType,
    })
    return engineVersions.versions.map(engineVersionToVersion)
  }

  // === Endpoints that intentionally do not work on the Local Backend ===

  /** Called for any function that does not make sense in the Local Backend.
   * @throws An error stating that the operation is intentionally unavailable on the local
   * backend. */
  invalidOperation(): never {
    throw new Error('Cannot manage users, folders, files, tags, and secrets on the local backend.')
  }

  /** Do nothing. This function should never need to be called. */
  override undoDeleteAsset(): Promise<void> {
    return this.invalidOperation()
  }

  /** Return an empty array. This function should never need to be called. */
  override listUsers() {
    return Promise.resolve([])
  }

  /** Invalid operation. */
  override createUser() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override updateUser() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override restoreUser() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override deleteUser() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override removeUser() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override uploadUserPicture() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override changeUserGroup() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getOrganization() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override updateOrganization() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override uploadOrganizationPicture() {
    return this.invalidOperation()
  }

  /** Do nothing. This function should never need to be called. */
  override inviteUser() {
    return Promise.resolve()
  }

  /** Do nothing. This function should never need to be called. */
  override createPermission() {
    return Promise.resolve()
  }

  /** Return `null`. This function should never need to be called. */
  override usersMe() {
    return this.invalidOperation()
  }

  /** Create a directory. */
  override async createDirectory(
    body: backend.CreateDirectoryRequestBody
  ): Promise<backend.CreatedDirectory> {
    const parentDirectoryPath =
      body.parentId == null ? this.projectManager.rootDirectory : extractTypeAndId(body.parentId).id
    const path = projectManager.joinPath(parentDirectoryPath, body.title)
    await this.projectManager.createDirectory(path)
    return {
      id: newDirectoryId(path),
      parentId: newDirectoryId(parentDirectoryPath),
      title: body.title,
    }
  }

  /** Change the parent directory of an asset.
   * Changing the description is NOT supported. */
  override async updateAsset(
    assetId: backend.AssetId,
    body: backend.UpdateAssetRequestBody
  ): Promise<void> {
    if (body.parentDirectoryId != null) {
      const typeAndId = extractTypeAndId(assetId)
      const from =
        typeAndId.type !== backend.AssetType.project
          ? typeAndId.id
          : this.projectManager.getProjectDirectoryPath(typeAndId.id)
      const fileName = fileInfo.fileName(from)
      const to = projectManager.joinPath(extractTypeAndId(body.parentDirectoryId).id, fileName)
      await this.projectManager.moveFile(from, to)
    }
  }

  /** Upload a file. */
  override async uploadFile(
    params: backend.UploadFileRequestParams,
    file: Blob
  ): Promise<backend.FileInfo> {
    const parentPath =
      params.parentDirectoryId == null
        ? this.projectManager.rootDirectory
        : extractTypeAndId(params.parentDirectoryId).id
    const path = projectManager.joinPath(parentPath, params.fileName)
    const searchParams = new URLSearchParams([
      ['file_name', params.fileName],
      ...(params.parentDirectoryId == null ? [] : [['directory', parentPath]]),
    ]).toString()
    await fetch(`${appBaseUrl.APP_BASE_URL}/api/upload-file?${searchParams}`, {
      method: 'POST',
      body: file,
    })
    // `project` MUST BE `null` as uploading projects uses a separate endpoint.
    return { path, id: newFileId(path), project: null }
  }

  /** Change the name of a file. */
  override async updateFile(
    fileId: backend.FileId,
    body: backend.UpdateFileRequestBody
  ): Promise<void> {
    const typeAndId = extractTypeAndId(fileId)
    const from = typeAndId.id
    const folderPath = fileInfo.folderPath(from)
    const to = projectManager.joinPath(projectManager.Path(folderPath), body.title)
    await this.projectManager.moveFile(from, to)
  }

  /** Construct a new path using the given parent directory and a file name. */
  getProjectDirectoryPath(id: backend.ProjectId) {
    return this.projectManager.getProjectDirectoryPath(extractTypeAndId(id).id)
  }

  /** Construct a new path using the given parent directory and a file name. */
  joinPath(parentId: backend.DirectoryId, fileName: string) {
    return projectManager.joinPath(extractTypeAndId(parentId).id, fileName)
  }

  /** Change the name of a directory. */
  override async updateDirectory(
    directoryId: backend.DirectoryId,
    body: backend.UpdateDirectoryRequestBody
  ): Promise<backend.UpdatedDirectory> {
    const from = extractTypeAndId(directoryId).id
    const folderPath = projectManager.Path(fileInfo.folderPath(from))
    const to = projectManager.joinPath(folderPath, body.title)
    await this.projectManager.moveFile(from, to)
    return {
      id: newDirectoryId(to),
      parentId: newDirectoryId(folderPath),
      title: body.title,
    }
  }

  /** Download from an arbitrary URL that is assumed to originate from this backend. */
  override async download(url: string, name?: string) {
    download.download(url, name)
    return Promise.resolve()
  }

  /** Invalid operation. */
  override restoreProject() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override listAssetVersions() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override checkResources() {
    return this.invalidOperation()
  }

  /** Return an empty array. This function should never need to be called. */
  override listFiles() {
    return Promise.resolve([])
  }

  /** Invalid operation. */
  override getFileDetails() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override listProjectSessions() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getProjectSessionLogs() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getFileContent() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override createDatalink() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getDatalink() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override deleteDatalink() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override createSecret() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override updateSecret() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getSecret() {
    return this.invalidOperation()
  }

  /** Return an empty array. This function should never need to be called. */
  override listSecrets() {
    return Promise.resolve([])
  }

  /** Invalid operation. */
  override createTag() {
    return this.invalidOperation()
  }

  /** Return an empty array. This function is required to be implemented as it is unconditionally
   * called, but its result should never need to be used. */
  override listTags() {
    return Promise.resolve([])
  }

  /** Do nothing. This function should never need to be called. */
  override associateTag() {
    return Promise.resolve()
  }

  /** Do nothing. This function should never need to be called. */
  override deleteTag() {
    return Promise.resolve()
  }

  /** Invalid operation. */
  override createUserGroup() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override createCheckoutSession() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override deleteUserGroup() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override listUserGroups() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getCheckoutSession() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override listInvitations() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override deleteInvitation() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override resendInvitation() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override getLogEvents() {
    return this.invalidOperation()
  }

  /** Invalid operation. */
  override logEvent() {
    return this.invalidOperation()
  }
}