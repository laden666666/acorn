import {reservedWords, keywords} from "./identifier"
import {types as tt} from "./tokentype"
import {lineBreak} from "./whitespace"
import {getOptions} from "./options"
import {wordsRegexp} from "./util"
import {SCOPE_TOP, SCOPE_FUNCTION, SCOPE_ASYNC, SCOPE_GENERATOR, SCOPE_SUPER, SCOPE_DIRECT_SUPER} from "./scopeflags"

// Parser 类的定义，是核心函数。其成员方法定义在各个子文件中，通过对其原型增加方法实现扩展。Parser 直接修改原型，连mixin都不用，真它喵服气，改为桥接模式多好
export class Parser {
  constructor(options, input, startPos) {
    this.options = options = getOptions(options)
    // 获取源码文件
    this.sourceFile = options.sourceFile
    // 确定关键字
    this.keywords = wordsRegexp(keywords[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5])
    let reserved = ""
    if (options.allowReserved !== true) {
      for (let v = options.ecmaVersion;; v--)
        if (reserved = reservedWords[v]) break
      if (options.sourceType === "module") reserved += " await"
    }
    // 确定预留字
    this.reservedWords = wordsRegexp(reserved)
    let reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict
    this.reservedWordsStrict = wordsRegexp(reservedStrict)
    this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind)
    // 将源码转为字符串，报错
    this.input = String(input)

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.
    // 是否包含转义字符 ？？？？？
    this.containsEsc = false

    // Set up token state

    // The current position of the tokenizer in the input.
    // 开始解析的位置
    if (startPos) {
      this.pos = startPos
      this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1
      this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length
    } else {
      // 其实位置
      this.pos = this.lineStart = 0
      // 当前行号，从1开始计数
      this.curLine = 1
    }

    // Properties of the current token:
    // Its type
    // 核心属性
    // 当前所属的tokenType的值，这是一个状态模式。
    // 初始是eof状态
    this.type = tt.eof
    // For tokens that include more information than their type, the value
    this.value = null
    // Its start and end offset
    // 一个token的开始和结束位置
    this.start = this.end = this.pos
    // And, if locations are used, the {line, column} object
    // corresponding to those offsets
    // 一个token的开始和结束位置（行、列号形式）
    this.startLoc = this.endLoc = this.curPosition()

    // Position information for the previous token
    // 前一个token的开始结束位置（行列号）
    this.lastTokEndLoc = this.lastTokStartLoc = null
    this.lastTokStart = this.lastTokEnd = this.pos

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    // 核心属性
    // 上下文，以一个块级上下文作为起始状态
    // 这是一个栈，用于保存各种块、作用域
    this.context = this.initialContext()
    // ？？？？？
    this.exprAllowed = true

    // Figure out if it's a module code.
    // 是否支持esm
    this.inModule = options.sourceType === "module"
    // 是否是严格模式（esm一定是严格模式）
    this.strict = this.inModule || this.strictDirective(this.pos)

    // Used to signify the start of a potential arrow function
    this.potentialArrowAt = -1

    // Positions to delayed-check that yield/await does not exist in default parameters.
    this.yieldPos = this.awaitPos = this.awaitIdentPos = 0
    // Labels in scope.
    this.labels = []
    // Thus-far undefined exports.
    this.undefinedExports = {}

    // If enabled, skip leading hashbang line.
    // 忽略node的cli注释
    if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!")
      this.skipLineComment(2)

    // Scope tracking for duplicate variable names (see scope.js)
    // 核心函数
    // 作用域
    this.scopeStack = []
    this.enterScope(SCOPE_TOP)

    // For RegExp validation
    this.regexpState = null
  }

  // 解析函数，核心****
  parse() {
    let node = this.options.program || this.startNode()
    this.nextToken()
    return this.parseTopLevel(node)
  }

  get inFunction() { return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0 }
  get inGenerator() { return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0 }
  get inAsync() { return (this.currentVarScope().flags & SCOPE_ASYNC) > 0 }
  get allowSuper() { return (this.currentThisScope().flags & SCOPE_SUPER) > 0 }
  get allowDirectSuper() { return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0 }
  get treatFunctionsAsVar() { return this.treatFunctionsAsVarInScope(this.currentScope()) }

  // Switch to a getter for 7.0.0.
  inNonArrowFunction() { return (this.currentThisScope().flags & SCOPE_FUNCTION) > 0 }

  static extend(...plugins) {
    let cls = this
    for (let i = 0; i < plugins.length; i++) cls = plugins[i](cls)
    return cls
  }

  static parse(input, options) {
    return new this(options, input).parse()
  }

  static parseExpressionAt(input, pos, options) {
    let parser = new this(options, input, pos)
    parser.nextToken()
    return parser.parseExpression()
  }

  static tokenizer(input, options) {
    return new this(options, input)
  }
}
