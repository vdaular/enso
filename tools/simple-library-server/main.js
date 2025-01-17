#!/usr/bin/env node
const express = require('express')
const crypto = require('crypto')
const path = require('path')
const os = require('os')
const fs = require('fs')
const fsPromises = require('fs/promises')
const multer = require('multer')
const compression = require('compression')
const yargs = require('yargs')
const semverValid = require('semver/functions/valid')

const LOG_REQUESTS = false

const argv = yargs
  .usage('$0', 'Allows to host Enso libraries and editions from the local filesystem through HTTP.')
  .option('port', {
    description: 'The port to listen on.',
    type: 'number',
    default: 8080,
  })
  .option('root', {
    description:
      'The root of the repository. It should contain a `libraries` or `editions` directory. See the documentation for more details.',
    type: 'string',
    default: '.',
  })
  .option('upload', {
    description:
      'Specifies whether to allow uploading libraries and which authentication model to choose.',
    choices: ['disabled', 'no-auth', 'constant-token'],
    default: 'disabled',
  })
  .help()
  .alias('help', 'h').argv

const libraryRoot = path.join(argv.root, 'libraries')

const app = express()
if (LOG_REQUESTS) {
  app.use((req, res, next) => {
    console.log(`Received [${req.method}] ${req.originalUrl}`)
    console.log(`  Headers: ${JSON.stringify(req.headers)}`)
    console.log(`  Query: ${JSON.stringify(req.query)}`)
    console.log(`  Body: ${JSON.stringify(req.body)}`)
    next()
  })
}

const tmpDir = path.join(os.tmpdir(), 'enso-library-repo-uploads')
const upload = multer({ dest: tmpDir })
app.use(compression({ filter: shouldCompress }))

/** The token to compare against for simple authentication.
 *
 * If it is not set, no authentication checks are made.
 */
let token = null
if (argv.upload == 'disabled') {
  console.log('Uploads are disabled.')
} else {
  app.post('/upload', upload.any(), handleUpload)

  if (argv.upload == 'constant-token') {
    const envVar = 'ENSO_AUTH_TOKEN'
    token = process.env[envVar]
    if (!token) {
      throw `${envVar} is not defined.`
    } else {
      console.log(`Checking the ${envVar} to authorize requests.`)
    }
  } else {
    console.log('WARNING: Uploads are enabled without any authentication.')
  }
}

app.get('/health', function (req, res) {
  res.status(200).send('OK')
})

app.use(express.static(argv.root))

let port = argv.port
if (process.env.PORT) {
  port = process.env.PORT
  console.log(`Overriding the port to ${port} set by the PORT environment variable.`)
}
console.log(`Serving the repository located under ${argv.root} on port ${port}.`)

const server = app.listen(port)

function handleShutdown() {
  console.log('Received a signal - shutting down.')
  server.close(() => {
    console.log('Server terminated.')
  })
}
process.on('SIGTERM', handleShutdown)
process.on('SIGINT', handleShutdown)

/// Specifies if a particular file can be compressed in transfer, if supported.
function shouldCompress(req, res) {
  if (req.path.endsWith('.yaml')) {
    return true
  }

  return compression.filter(req, res)
}

/** Handles upload of a library. */
async function handleUpload(req, res) {
  function fail(code, message) {
    res.status(code).json({ error: message })
    if (req.files !== undefined) {
      cleanFiles(req.files)
    }
  }

  if (token !== null) {
    const userToken = req.get('Auth-Token')
    if (userToken != token) {
      return fail(403, 'Authorization failed.')
    }
  }

  const version = req.query.version
  const namespace = req.query.namespace
  const name = req.query.name

  if (version === undefined || namespace == undefined || name === undefined) {
    return fail(400, 'One or more required fields were missing.')
  }

  if (!isVersionValid(version)) {
    return fail(400, `Invalid semver version string [${version}].`)
  }

  if (!isNamespaceValid(namespace)) {
    return fail(400, `Invalid username [${namespace}].`)
  }

  if (!isNameValid(name)) {
    return fail(400, `Invalid library name [${name}].`)
  }

  for (var i = 0; i < req.files.length; ++i) {
    const filename = req.files[i].originalname
    if (!isFilenameValid(filename)) {
      return fail(400, `Invalid filename: ${filename}.`)
    }
  }

  const libraryBasePath = path.join(libraryRoot, namespace, name)
  const libraryPath = path.join(libraryBasePath, version)

  /** Finds a name for a temporary directory to move the files to,
      so that the upload can then be committed atomically by renaming
      a single directory. */
  function findRandomTemporaryDirectory() {
    const randomName = crypto.randomBytes(32).toString('hex')
    const temporaryPath = path.join(libraryBasePath, randomName)
    if (fs.existsSync(temporaryPath)) {
      return findRandomTemporaryDirectory()
    }

    return temporaryPath
  }

  if (fs.existsSync(libraryPath)) {
    return fail(
      409,
      'A library with the given name and version ' +
        'combination already exists. Versions are immutable, so you must ' +
        'bump the library version when uploading a newer version.',
    )
  }

  const temporaryPath = findRandomTemporaryDirectory()
  await fsPromises.mkdir(libraryBasePath, { recursive: true })
  await fsPromises.mkdir(temporaryPath, { recursive: true })

  console.log(`Uploading library [${namespace}.${name}:${version}].`)
  try {
    await putFiles(temporaryPath, req.files)
    await fsPromises.rename(temporaryPath, libraryPath)
  } catch (error) {
    console.log(`Upload failed: [${error}].`)
    console.error(error.stack)
    return fail(500, 'Upload failed due to an internal error.')
  }

  console.log('Upload complete.')
  res.status(200).json({ message: 'Successfully uploaded the library.' })
}

/// Checks if a version complies with the semver specification.
function isVersionValid(version) {
  return semverValid(version) !== null
}

/// Checks if the namespace/username is valid.
function isNamespaceValid(namespace) {
  return /^[A-Za-z][a-z0-9]*$/.test(namespace) && namespace.length >= 3
}

/** Checks if the library name is valid.
 *
 * It may actually accept more identifiers as valid than Enso would, the actual
 * check should be done when creating the library. This is just a sanity check
 * for safety.
 */
function isNameValid(name) {
  return /^[A-Za-z0-9_]+$/.test(name)
}

// TODO [RW] for now slashes are not permitted to avoid attacks; later on at least the `meta` directory should be allowed, but not much besides that
/// Checks if the uploaded filename is valid.
function isFilenameValid(name) {
  return /^[A-Za-z0-9][A-Za-z0-9\._\-]*$/.test(name)
}

/// Schedules to remove the files, if they still exist.
function cleanFiles(files) {
  files.forEach(file => {
    if (fs.existsSync(file.path)) {
      fs.unlink(file.path, err => {
        if (err) {
          console.error(
            `Failed to remove ${file.path} ($file.originalname) from a failed upload: ${err}.`,
          )
        }
      })
    }
  })
}

/// Moves the files to the provided destination directory.
async function putFiles(directory, files) {
  for (var i = 0; i < files.length; ++i) {
    const file = files[i]
    const filename = file.originalname
    const destination = path.join(directory, filename)
    await fsPromises.copyFile(file.path, destination)
    await fsPromises.unlink(file.path)
  }
}
