// The algorithm used to determine whether a regexp can appear at a
// given point in the program is loosely based on sweet.js' approach.
// See https://github.com/mozilla/sweet.js/wiki/design

import {Parser} from "./state"
import {types as tt} from "./tokentype"
import {lineBreak} from "./whitespace"

// 上下文
export class TokContext {
  constructor(token, isExpr, preserveSpace, override, generator) {
    // 开始上下文的词
    this.token = token
    // 是否是在表达式里面
    this.isExpr = !!isExpr
    // 保留空格
    this.preserveSpace = !!preserveSpace
    // 代替默认的 readToken 函数实现
    this.override = override
    // 创建新上下文？？
    this.generator = !!generator
  }
}

// 上下文字典对象
export const types = {
  // 静态的块，不可用定义表达式
  b_stat: new TokContext("{", false),
  // 表达式块
  b_expr: new TokContext("{", true),
  // 模板块
  b_tmpl: new TokContext("${", false),
  // 静态的()，不在表达式里面
  p_stat: new TokContext("(", false),
  // 动态的()，在表达中使用（）
  p_expr: new TokContext("(", true),
  // 模板字符串，只有模板字符串保留空格
  q_tmpl: new TokContext("`", true, true, p => p.tryReadTemplateToken()),
  // 函数开始定义，静态部分，不可定义匿名函数
  f_stat: new TokContext("function", false),
  // 函数开始定义，表达式中部分，可定义匿名函数
  f_expr: new TokContext("function", true),
  // 生成器函数开始定义，表达式中部分，可定义匿名函数
  f_expr_gen: new TokContext("function", true, false, null, true),
  // 生成器函数，静态部分，不可定义匿名函数
  f_gen: new TokContext("function", false, false, null, true)
}

const pp = Parser.prototype

// 初始化上下文，最外层是一个块上下文
pp.initialContext = function() {
  return [types.b_stat]
}

// 判断当前是否可以写语句（不处于表达式内或一些特殊语法中）
pp.braceIsBlock = function(prevType) {
  let parent = this.curContext()
  if (parent === types.f_expr || parent === types.f_stat)
    return true
  if (prevType === tt.colon && (parent === types.b_stat || parent === types.b_expr))
    return !parent.isExpr

  // The check for `tt.name && exprAllowed` detects whether we are
  // after a `yield` or `of` construct. See the `updateContext` for
  // `tt.name`.
  if (prevType === tt._return || prevType === tt.name && this.exprAllowed)
    return lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  if (prevType === tt._else || prevType === tt.semi || prevType === tt.eof || prevType === tt.parenR || prevType === tt.arrow)
    return true
  if (prevType === tt.braceL)
    return parent === types.b_stat
  if (prevType === tt._var || prevType === tt._const || prevType === tt.name)
    return false
  return !this.exprAllowed
}


// 判断是否在生成器函数中
pp.inGeneratorContext = function() {
  for (let i = this.context.length - 1; i >= 1; i--) {
    let context = this.context[i]
    if (context.token === "function")
      return context.generator
  }
  return false
}

// 根据tokenType更新context
pp.updateContext = function(prevType) {
  let update, type = this.type
  if (type.keyword && prevType === tt.dot)
    this.exprAllowed = false
  else if (update = type.updateContext)
    update.call(this, prevType)
  else
    this.exprAllowed = type.beforeExpr
}

// Token-specific context update code

// 定义各个状态中可以更新上下文的方法
// )
tt.parenR.updateContext = tt.braceR.updateContext = function() {
  if (this.context.length === 1) {
    this.exprAllowed = true
    return
  }
  let out = this.context.pop()
  if (out === types.b_stat && this.curContext().token === "function") {
    out = this.context.pop()
  }
  this.exprAllowed = !out.isExpr
}

// {
tt.braceL.updateContext = function(prevType) {
  this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr)
  this.exprAllowed = true
}

// ${
tt.dollarBraceL.updateContext = function() {
  this.context.push(types.b_tmpl)
  this.exprAllowed = true
}

// (
tt.parenL.updateContext = function(prevType) {
  let statementParens = prevType === tt._if || prevType === tt._for || prevType === tt._with || prevType === tt._while
  this.context.push(statementParens ? types.p_stat : types.p_expr)
  this.exprAllowed = true
}

// ++/--
tt.incDec.updateContext = function() {
  // tokExprAllowed stays unchanged
}

// 函数
tt._function.updateContext = tt._class.updateContext = function(prevType) {
  if (prevType.beforeExpr && prevType !== tt.semi && prevType !== tt._else &&
      !(prevType === tt._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) &&
      !((prevType === tt.colon || prevType === tt.braceL) && this.curContext() === types.b_stat))
    this.context.push(types.f_expr)
  else
    this.context.push(types.f_stat)
  this.exprAllowed = false
}

// 引号
tt.backQuote.updateContext = function() {
  if (this.curContext() === types.q_tmpl)
    this.context.pop()
  else
    this.context.push(types.q_tmpl)
  this.exprAllowed = false
}

// *
tt.star.updateContext = function(prevType) {
  // 对生成器函数的处理
  if (prevType === tt._function) {
    let index = this.context.length - 1
    // 将缓存的
    if (this.context[index] === types.f_expr)
      this.context[index] = types.f_expr_gen
    else
      this.context[index] = types.f_gen
  }
  // 否则是乘号
  this.exprAllowed = true
}

// 名字
tt.name.updateContext = function(prevType) {
  let allowed = false
  if (this.options.ecmaVersion >= 6 && prevType !== tt.dot) {
    // 对新的非关键字名字的处理:
    // off???
    // 不在生成器函数中 const yield = 1 是合法的
    if (this.value === "of" && !this.exprAllowed ||
        this.value === "yield" && this.inGeneratorContext())
      allowed = true
  }
  this.exprAllowed = allowed
}
