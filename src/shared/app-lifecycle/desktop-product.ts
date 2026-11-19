declare const __DESKTOP_PRODUCT__: { name: string; githubRepository: string } | undefined

// Only the Cocos desktop build defines it; a bare read throws a ReferenceError everywhere else.
export const desktopProduct =
  typeof __DESKTOP_PRODUCT__ === 'object' ? __DESKTOP_PRODUCT__ : undefined
export const productRepository = desktopProduct?.githubRepository ?? 'stablyai/orca'
export const productRepositoryUrl = `https://github.com/${productRepository}`
