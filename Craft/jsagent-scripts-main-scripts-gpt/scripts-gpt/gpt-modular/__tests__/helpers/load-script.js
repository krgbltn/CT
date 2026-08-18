import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(__dirname, '../..')

/**
 * Загружает скрипты в изолированный VM-контекст, имитируя конкатенацию платформы.
 *
 * @param {string[]} filePaths - пути относительно scripts-gpt/
 * @param {object}   [globals={}] - mock-глобалы для sandbox
 * @returns {object} VM-контекст со всеми function-объявлениями как свойствами
 */
export function loadScript(filePaths, globals = {}) {
  let code = filePaths
    .map(f => readFileSync(resolve(SCRIPTS_DIR, f), 'utf-8'))
    .join('\n')

  code += '\nfunction __getLetVar(name) { return eval(name) }'

  const ctx = createContext(globals)
  runInContext(code, ctx)
  return ctx
}
