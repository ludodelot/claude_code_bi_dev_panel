const MAX_LINES = 200

// Keeps recent log lines in memory (for issue reports) and mirrors them to an Output channel when one is given.
function createLogger(channel) {
  let lines = []
  const write = (level, message, error) => {
    const detail = error ? ' :: ' + (error && error.message ? error.message : String(error)) : ''
    const line = new Date().toISOString() + ' [' + level + '] ' + message + detail
    lines = [...lines, line].slice(-MAX_LINES)
    if (channel) channel.appendLine(line)
  }
  return {
    info: message => write('info', message),
    warn: (message, error) => write('warn', message, error),
    error: (message, error) => write('error', message, error),
    recent: () => lines,
    recentProblems: () => lines.filter(l => l.includes('[warn]') || l.includes('[error]')),
  }
}

module.exports = { createLogger }
