import {Parser} from "./state"
import {SourceLocation} from "./locutil"

// AST的节点，应该是一个树，但是目前未发现Node自关联的代码
export class Node {
  constructor(parser, pos, loc) {
    this.type = ""
    this.start = pos
    this.end = 0
    if (parser.options.locations)
      this.loc = new SourceLocation(parser, loc)
    if (parser.options.directSourceFile)
      this.sourceFile = parser.options.directSourceFile
    if (parser.options.ranges)
      this.range = [pos, 0]
  }
}

// Start an AST node, attaching a start offset.

const pp = Parser.prototype

// 开始解析，就是创建一个根Node
pp.startNode = function() {
  return new Node(this, this.start, this.startLoc)
}

// 指定位置开始解析，同样创建了一个跟Node
pp.startNodeAt = function(pos, loc) {
  return new Node(this, pos, loc)
}

// Finish an AST node, adding `type` and `end` properties.

function finishNodeAt(node, type, pos, loc) {
  node.type = type
  node.end = pos
  if (this.options.locations)
    node.loc.end = loc
  if (this.options.ranges)
    node.range[1] = pos
  return node
}

pp.finishNode = function(node, type) {
  return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc)
}

// Finish node at given position

pp.finishNodeAt = function(node, type, pos, loc) {
  return finishNodeAt.call(this, node, type, pos, loc)
}
