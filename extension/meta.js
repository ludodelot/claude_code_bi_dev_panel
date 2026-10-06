// Single place for where the project lives, so links, update checks and issue reports never drift apart.
const REPO_SLUG = 'ludodelot/claude_code_bi_dev_panel'
const REPO_URL = 'https://github.com/' + REPO_SLUG
const ISSUES_NEW_URL = REPO_URL + '/issues/new'
const RELEASES_LATEST_API = 'https://api.github.com/repos/' + REPO_SLUG + '/releases/latest'
const RELEASE_DOWNLOAD_PREFIX = REPO_URL + '/releases/download/'
const VSIX_NAME = /^claude-usage-bar-\d+\.\d+\.\d+\.vsix$/
const SUMS_NAME = 'SHA256SUMS'

module.exports = { REPO_SLUG, REPO_URL, ISSUES_NEW_URL, RELEASES_LATEST_API, RELEASE_DOWNLOAD_PREFIX, VSIX_NAME, SUMS_NAME }
