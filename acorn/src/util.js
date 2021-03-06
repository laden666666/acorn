const {hasOwnProperty, toString} = Object.prototype

// Checks if an object has a property.

export function has(obj, propName) {
  return hasOwnProperty.call(obj, propName)
}

export const isArray = Array.isArray || ((obj) => (
  toString.call(obj) === "[object Array]"
))

// 将一个词转为正则
export function wordsRegexp(words) {
  return new RegExp("^(?:" + words.replace(/ /g, "|") + ")$")
}
