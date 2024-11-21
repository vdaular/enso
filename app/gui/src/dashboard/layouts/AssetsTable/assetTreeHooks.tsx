/** @file A hook to return the asset tree. */
import { useMemo } from 'react'

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  assetIsDirectory,
  createRootDirectoryAsset,
  createSpecialEmptyAsset,
  createSpecialErrorAsset,
  createSpecialLoadingAsset,
  type AnyAsset,
  type DirectoryAsset,
  type DirectoryId,
} from 'enso-common/src/services/Backend'

import { listDirectoryQueryOptions } from '#/hooks/backendHooks'
import type { Category } from '#/layouts/CategorySwitcher/Category'
import { useFullUserSession } from '#/providers/AuthProvider'
import { useBackend } from '#/providers/BackendProvider'
import { useFeatureFlag } from '#/providers/FeatureFlagsProvider'
import { ROOT_PARENT_DIRECTORY_ID } from '#/services/remoteBackendPaths'
import AssetTreeNode, { type AnyAssetTreeNode } from '#/utilities/AssetTreeNode'

/** Return type of the query function for the `listDirectory` query. */
export type DirectoryQuery = readonly AnyAsset[] | undefined

/** Options for {@link useAssetTree}. */
export interface UseAssetTreeOptions {
  readonly hidden: boolean
  readonly category: Category
  readonly rootDirectory: DirectoryAsset
  readonly expandedDirectoryIds: readonly DirectoryId[]
}

/** A hook to return the asset tree. */
export function useAssetTree(options: UseAssetTreeOptions) {
  const { hidden, category, rootDirectory, expandedDirectoryIds } = options
  const { user } = useFullUserSession()
  const backend = useBackend(category)
  const enableAssetsTableBackgroundRefresh = useFeatureFlag('enableAssetsTableBackgroundRefresh')
  const assetsTableBackgroundRefreshInterval = useFeatureFlag(
    'assetsTableBackgroundRefreshInterval',
  )

  const directories = useQueries({
    // We query only expanded directories, as we don't want to load the data for directories that are not visible.
    queries: expandedDirectoryIds.map((directoryId) => ({
      ...listDirectoryQueryOptions({
        backend,
        parentId: directoryId,
        category,
      }),
      enabled: !hidden,
    })),
    combine: (results) => {
      const rootQuery = results[expandedDirectoryIds.indexOf(rootDirectory.id)]

      return {
        rootDirectory: {
          isFetching: rootQuery?.isFetching ?? true,
          isLoading: rootQuery?.isLoading ?? true,
          isError: rootQuery?.isError ?? false,
          error: rootQuery?.error,
          data: rootQuery?.data,
        },
        directories: new Map(
          results.map((res, i) => [
            expandedDirectoryIds[i],
            {
              isFetching: res.isFetching,
              isLoading: res.isLoading,
              isError: res.isError,
              error: res.error,
              data: res.data,
            },
          ]),
        ),
      }
    },
  })

  const queryClient = useQueryClient()

  // We use a different query to refetch the directory data in the background.
  // This reduces the amount of rerenders by batching them together, so they happen less often.
  useQuery(
    useMemo(
      () => ({
        queryKey: [backend.type, 'refetchListDirectory'],
        queryFn: async () => {
          await queryClient.refetchQueries({ queryKey: [backend.type, 'listDirectory'] })
          return null
        },
        refetchInterval:
          enableAssetsTableBackgroundRefresh ? assetsTableBackgroundRefreshInterval : false,
        refetchOnMount: 'always',
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        enabled: !hidden,
        meta: { persist: false },
      }),
      [
        backend.type,
        enableAssetsTableBackgroundRefresh,
        assetsTableBackgroundRefreshInterval,
        hidden,
        queryClient,
      ],
    ),
  )

  const rootDirectoryContent = directories.rootDirectory.data
  const isError = directories.rootDirectory.isError
  const isLoading = directories.rootDirectory.isLoading && !isError

  const assetTree = useMemo(() => {
    const rootPath = 'rootPath' in category ? category.rootPath : backend.rootPath(user)

    // If the root directory is not loaded, then we cannot render the tree.
    // Return null, and wait for the root directory to load.
    if (rootDirectoryContent == null) {
      return AssetTreeNode.fromAsset(
        createRootDirectoryAsset(rootDirectory.id),
        ROOT_PARENT_DIRECTORY_ID,
        ROOT_PARENT_DIRECTORY_ID,
        -1,
        rootPath,
        null,
      )
    } else if (isError) {
      return AssetTreeNode.fromAsset(
        createRootDirectoryAsset(rootDirectory.id),
        ROOT_PARENT_DIRECTORY_ID,
        ROOT_PARENT_DIRECTORY_ID,
        -1,
        rootPath,
        null,
      ).with({
        children: [
          AssetTreeNode.fromAsset(
            createSpecialErrorAsset(rootDirectory.id),
            rootDirectory.id,
            rootDirectory.id,
            0,
            '',
          ),
        ],
      })
    }

    const rootId = rootDirectory.id

    const children = rootDirectoryContent.map((content) => {
      /**
       * Recursively build assets tree. If a child is a directory, we search for its content
       * in the loaded data. If it is loaded, we append that data to the asset node
       * and do the same for the children.
       */
      const withChildren = (node: AnyAssetTreeNode, depth: number) => {
        const { item } = node

        if (assetIsDirectory(item)) {
          const childrenAssetsQuery = directories.directories.get(item.id)

          const nestedChildren = childrenAssetsQuery?.data?.map((child) =>
            AssetTreeNode.fromAsset(
              child,
              item.id,
              item.id,
              depth,
              `${node.path}/${child.title}`,
              null,
              child.id,
            ),
          )

          if (childrenAssetsQuery == null || childrenAssetsQuery.isLoading) {
            node = node.with({
              children: [
                AssetTreeNode.fromAsset(
                  createSpecialLoadingAsset(item.id),
                  item.id,
                  item.id,
                  depth,
                  '',
                ),
              ],
            })
          } else if (childrenAssetsQuery.isError) {
            node = node.with({
              children: [
                AssetTreeNode.fromAsset(
                  createSpecialErrorAsset(item.id),
                  item.id,
                  item.id,
                  depth,
                  '',
                ),
              ],
            })
          } else if (nestedChildren?.length === 0) {
            node = node.with({
              children: [
                AssetTreeNode.fromAsset(
                  createSpecialEmptyAsset(item.id),
                  item.id,
                  item.id,
                  depth,
                  '',
                ),
              ],
            })
          } else if (nestedChildren != null) {
            node = node.with({
              children: nestedChildren.map((child) => withChildren(child, depth + 1)),
            })
          }
        }

        return node
      }

      const node = AssetTreeNode.fromAsset(
        content,
        rootId,
        rootId,
        0,
        `${rootPath}/${content.title}`,
        null,
        content.id,
      )

      const ret = withChildren(node, 1)
      return ret
    })

    return new AssetTreeNode(
      rootDirectory,
      ROOT_PARENT_DIRECTORY_ID,
      ROOT_PARENT_DIRECTORY_ID,
      children,
      -1,
      rootPath,
      null,
      rootId,
    )
  }, [
    backend,
    category,
    directories.directories,
    isError,
    rootDirectory,
    rootDirectoryContent,
    user,
  ])

  return { isLoading, isError, assetTree } as const
}
