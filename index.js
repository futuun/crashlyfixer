#!/usr/bin/env node

'use strict';

/* most of code comes from: https://github.com/SoftwareMansion/stack-beautifier */

const sourceMap = require('source-map')
const fs = require('fs')
const readline = require('readline')
const commander = require('commander')
const program = new commander.Command('crashlyfix')
const pkg = require('./package.json')

program.arguments('<sourceMap> <stackTrace>')
program.version(pkg.version)
program.usage('<sourcemap.js.map> <stack_trace.txt>')
program.description('Crashlyfixer is a simple tool for decrypting stack traces coming from the minified JS code.')

program.action((sourceMap, stackTrace) => {
  main(program)
})

program.parse(process.argv)
if (!program.args.length) {
  program.help()
}

function main(program) {
  const mapFilename = program.args[0] // sourcemap
  const stackTraceFilename = program.args[1]

  const traceFilename = program.trace
  const outputFilename = program.output

  const sourceMapConsumer = new sourceMap.SourceMapConsumer(fs.readFileSync(mapFilename, 'utf8'))

  const stackTrace = fs.readFileSync(stackTraceFilename).toString().split('\n\n')
  const keek = stackTrace.filter(value => value.match('JavascriptException'))[0]
  const lines = keek.split('\n')
  const stack = processStack(lines, sourceMapConsumer)
  const data = formatStack(stack, !program.long)
  process.stdout.write(data)
  process.stdout.write('\n')
}

function processMatchedLine(match, sourceMapConsumer) {
  const { name, line, column } = match
  return sourceMapConsumer.originalPositionFor({line, column, name})
}

function matchStackLine(line) {
  const STACK_LINE_MATCHERS = [
    { regex: /^(.*)\@(\d+)\:(\d+)$/, idx: [1,2,3] },             // Format: someFun@13:12
    { regex: /^at (.*)\:(\d+)\:(\d+)$/, idx: [1,2,3] },          // Format: at filename:13:12
    { regex: /^at (.*) \((.*)\:(\d+)\:(\d+)\)$/, idx: [1,3,4] }, // Format: at someFun (filename:13:12)
  ]

  const found = STACK_LINE_MATCHERS.find(m => {
    return m.regex.test(line)
  })
  if (found) {
    const match = line.match(found.regex)
    return {
      name: match[found.idx[0]],
      line: match[found.idx[1]],
      column: match[found.idx[2]],
    }
  }
  return null
}

function processStack(lines, sourceMapConsumer) {
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = matchStackLine(line)
    if (!match) {
      if (i === 0) {
        // we allow first line to contain trace message, we just pass it through to the result table
        result.push({text: line})
      } else if (!line) {
        // we treat empty stack trace line as the end of an input
        break
      } else {
        throw new Error(`Stack trace parse error at line ${i+1}: ${line}`)
      }
    } else {
      result.push(processMatchedLine(match, sourceMapConsumer))
    }
  }
  return result
}

function formatStack(lines, shorten = true) {
  let replacePrefix = ''
  if (shorten) {
    const sources = lines.filter(r => r.source).map(r => r.source)
    if (sources.length > 1) {
      let prefix = sources[0]
      sources.forEach(s => {
        while (prefix !== s.slice(0, prefix.length) || prefix.indexOf('node_modules') !== -1) {
          prefix = prefix.slice(0, -1)
        }
      })
      if (prefix !== sources[0]) {
        replacePrefix = prefix
      }
    }
  }
  return lines.map(r => {
    if (r.text) {
      return r.text
    } else {
      const source = (replacePrefix && r.source.startsWith(replacePrefix)) ? './' + r.source.slice(replacePrefix.length) : r.source
      if (r.name) {
        return `  at ${r.name} (${r.source}:${r.line}:${r.column})`
      } else {
        return `  at ${r.source}:${r.line}:${r.column}`
      }
    }
  }).join('\n')
}
