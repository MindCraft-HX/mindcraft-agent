import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = pathToFileURL(path.join(projectRoot, 'src', specifier.slice(2))).href
    return defaultResolve(resolved, context, defaultResolve)
  }
  return defaultResolve(specifier, context, defaultResolve)
}
