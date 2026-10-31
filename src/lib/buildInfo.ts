export const REPO_URL = 'https://github.com/cmdr-threethree/carrier-jump-ocr'

const injectedCommitSha =
  typeof __COMMIT_SHA__ === 'string' && __COMMIT_SHA__ ? __COMMIT_SHA__ : 'dev'

export function shortCommit(sha: string, length = 7): string {
  const value = sha.trim()
  if (!value || value === 'dev') return 'dev'
  return value.slice(0, length)
}

export function commitUrl(sha: string): string {
  const value = sha.trim()
  return value && value !== 'dev' ? `${REPO_URL}/commit/${value}` : REPO_URL
}

export const COMMIT_SHA = injectedCommitSha
export const SHORT_COMMIT = shortCommit(COMMIT_SHA)
export const COMMIT_URL = commitUrl(COMMIT_SHA)
