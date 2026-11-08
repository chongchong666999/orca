import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(
      `Internal signing command failed (${program}): ${result.stderr?.trim() ?? 'could not start'}`
    )
  }
  return result.stdout.trim()
}

export function prepareInternalSigning() {
  const directory = path.join(homedir(), 'Library/Application Support/cocos-agent-build/signing')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const lock = path.join(directory, 'build.lock')
  mkdirSync(lock, { mode: 0o700 })
  try {
    const keychain = path.join(directory, 'internal.keychain-db')
    const passwordFile = path.join(directory, 'password')
    const identityFile = path.join(directory, 'identity.json')
    if (!existsSync(identityFile)) {
      if (existsSync(keychain) || existsSync(passwordFile)) {
        throw new Error(
          `Incomplete signing identity in ${directory}; preserve it and recover before rebuilding`
        )
      }
      const password = randomBytes(32).toString('hex')
      writeFileSync(passwordFile, password, { mode: 0o600 })
      const key = path.join(lock, 'key.pem')
      const cert = path.join(lock, 'cert.pem')
      const p12 = path.join(lock, 'identity.p12')
      const config = path.join(lock, 'certificate.cnf')
      writeFileSync(
        config,
        '[req]\ndistinguished_name=dn\nx509_extensions=signing\n[dn]\n[signing]\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n',
        { mode: 0o600 }
      )
      run('/usr/bin/openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:3072',
        '-nodes',
        '-days',
        '3650',
        '-subj',
        '/CN=Cocos Agent Internal Build/',
        '-keyout',
        key,
        '-out',
        cert,
        '-config',
        config
      ])
      run('/usr/bin/openssl', [
        'pkcs12',
        '-export',
        '-inkey',
        key,
        '-in',
        cert,
        '-out',
        p12,
        '-passout',
        `file:${passwordFile}`
      ])
      run('/usr/bin/security', ['create-keychain', '-p', password, keychain])
      run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain])
      run('/usr/bin/security', [
        'import',
        p12,
        '-k',
        keychain,
        '-P',
        password,
        '-T',
        '/usr/bin/codesign'
      ])
      const fingerprint = run('/usr/bin/openssl', [
        'x509',
        '-in',
        cert,
        '-noout',
        '-fingerprint',
        '-sha1'
      ])
        .split('=')
        .at(-1)
        .replaceAll(':', '')
      if (!/^[A-Fa-f0-9]{40}$/.test(fingerprint)) {
        throw new Error('Invalid signing certificate fingerprint')
      }
      writeFileSync(identityFile, JSON.stringify({ identity: fingerprint, keychain }), {
        mode: 0o600
      })
    }
    const signing = JSON.parse(readFileSync(identityFile, 'utf8'))
    const password = readFileSync(passwordFile, 'utf8')
    run('/usr/bin/security', ['unlock-keychain', '-p', password, signing.keychain])
    return signing
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

export async function signCocosInternalApp(options) {
  const { sign } = await import('@electron/osx-sign')
  const signing = prepareInternalSigning()
  const lock = path.join(path.dirname(signing.keychain), 'sign.lock')
  mkdirSync(lock, { mode: 0o700 })
  const keychains = () =>
    (run('/usr/bin/security', ['list-keychains', '-d', 'user']).match(/"[^"]+"/g) ?? []).map(
      (value) => value.slice(1, -1)
    )
  let added = false
  try {
    const previous = keychains()
    added = !previous.includes(signing.keychain)
    // codesign locates the private key through the user search list even with --keychain.
    if (added) {
      run('/usr/bin/security', [
        'list-keychains',
        '-d',
        'user',
        '-s',
        ...previous,
        signing.keychain
      ])
    }
    await sign({
      ...options,
      ...signing,
      identityValidation: false,
      optionsForFile: (file, context) => ({
        ...options.optionsForFile?.(file, context),
        timestamp: 'none'
      }),
      batchCodesignCalls: true
    })
  } finally {
    try {
      if (added) {
        run('/usr/bin/security', [
          'list-keychains',
          '-d',
          'user',
          '-s',
          ...keychains().filter((item) => item !== signing.keychain)
        ])
      }
    } finally {
      rmSync(lock, { recursive: true, force: true })
    }
  }
}
