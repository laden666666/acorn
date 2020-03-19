import {types as tt} from "./tokentype"
import {Parser} from "./state"
import {lineBreak, skipWhiteSpace} from "./whitespace"

const pp = Parser.prototype

// 这些函数是一个编译器的工具函数，适用于任何编译器。像eat、expect、unexpected等函数，其他编译器源码也读过类似的函数，值得学习

// ## Parser utilities
// 判断是否是严格模式
const literal = /^(?:'((?:\\.|[^'])*?)'|"((?:\\.|[^"])*?)")/
pp.strictDirective = function(start) {
  // 找到第一个字符串，看他是否是严格模式的开始标准
  for (;;) {
    // Try to find string literal.
    skipWhiteSpace.lastIndex = start
    start += skipWhiteSpace.exec(this.input)[0].length
    let match = literal.exec(this.input.slice(start))
    if (!match) return false
    if ((match[1] || match[2]) === "use strict") return true
    start += match[0].length

    // Skip semicolon, if any.
    skipWhiteSpace.lastIndex = start
    start += skipWhiteSpace.exec(this.input)[0].length
    if (this.input[start] === ";")
      start++
  }
}

// Predicate that tests whether the next token is of the given
// type, and if yes, consumes it as a side effect.
// 校验解析的token是否是指定类型，如果是则解析下一个token
pp.eat = function(type) {
  if (this.type === type) {
    this.next()
    return true
  } else {
    return false
  }
}

// Tests whether parsed token is a contextual keyword.
// 检测token是否是指定字段（一般是关键字的检测）
pp.isContextual = function(name) {
  return this.type === tt.name && this.value === name && !this.containsEsc
}

// Consumes contextual keyword if possible.
// 校验解析的token是否是指定值，如果是则解析下一个token
pp.eatContextual = function(name) {
  if (!this.isContextual(name)) return false
  this.next()
  return true
}

// Asserts that following token is given contextual keyword.
// 判断解析的token是否是指定值，如果不是，抛出异常
pp.expectContextual = function(name) {
  if (!this.eatContextual(name)) this.unexpected()
}

// Test whether a semicolon can be inserted at the current position.
// 是否可以插入分号
pp.canInsertSemicolon = function() {
  // 文档结束可以插入分号；}后面可以插入分号；换行可以插入分号？？？？？？？？？？？？
  return this.type === tt.eof ||
    this.type === tt.braceR ||
    lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
}

pp.insertSemicolon = function() {
  if (this.canInsertSemicolon()) {
    if (this.options.onInsertedSemicolon)
      this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc)
    return true
  }
}

// Consume a semicolon, or, failing that, see if we are allowed to
// pretend that there is a semicolon at this position.
// 对分号的解析，如果没有分号，并且不能插入分号，直接抛出错误（ASI允许省略分号，但是在不能自动插入分号的场景省略分号，必须抛出错误，如：[]{}）
pp.semicolon = function() {
  if (!this.eat(tt.semi) && !this.insertSemicolon()) this.unexpected()
}

// 参考 https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Trailing_commas
pp.afterTrailingComma = function(tokType, notNext) {
  if (this.type === tokType) {
    if (this.options.onTrailingComma)
      this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc)
    if (!notNext)
      this.next()
    return true
  }
}

// Expect a token of a given type. If found, consume it, otherwise,
// raise an unexpected token error.
// 抛错版eat
pp.expect = function(type) {
  this.eat(type) || this.unexpected()
}

// Raise an unexpected token error.
// 抛出错误，pos是为了做编译错误格式化，如babel-code-frame
pp.unexpected = function(pos) {
  this.raise(pos != null ? pos : this.start, "Unexpected token")
}

// 描述错误的对象
export function DestructuringErrors() {
  // 属性值应该是指错误所在文档中的index。所以初始值是-1
  this.shorthandAssign =
  // 尾部, 如[1,2,,,]
  this.trailingComma =
  this.parenthesizedAssign =
  this.parenthesizedBind =
  this.doubleProto =
    -1
}

// 几种常见的错误抛出：

// 
pp.checkPatternErrors = function(refDestructuringErrors, isAssign) {
  if (!refDestructuringErrors) return
  if (refDestructuringErrors.trailingComma > -1)
    this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element")
  let parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind
  if (parens > -1) this.raiseRecoverable(parens, "Parenthesized pattern")
}

pp.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
  if (!refDestructuringErrors) return false
  let {shorthandAssign, doubleProto} = refDestructuringErrors
  if (!andThrow) return shorthandAssign >= 0 || doubleProto >= 0
  if (shorthandAssign >= 0)
    this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns")
  if (doubleProto >= 0)
    this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property")
}

// Yield Await 分别在生成器函数和异步函数中不能做参数名
pp.checkYieldAwaitInDefaultParams = function() {
  if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos))
    this.raise(this.yieldPos, "Yield expression cannot be a default value")
  if (this.awaitPos)
    this.raise(this.awaitPos, "Await expression cannot be a default value")
}

pp.isSimpleAssignTarget = function(expr) {
  if (expr.type === "ParenthesizedExpression")
    return this.isSimpleAssignTarget(expr.expression)
  return expr.type === "Identifier" || expr.type === "MemberExpression"
}
