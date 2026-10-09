function releaseHeaders(release = process.env.MYELIN_RELEASE_COMMIT) {
  return {
    'X-Myelin-Protocol': String(require('./protocol-v1.json').version),
    ...(/^[a-f0-9]{40}$/.test(release ?? '') ? { 'X-Myelin-Release': release } : {}),
  };
}
module.exports = { releaseHeaders };
