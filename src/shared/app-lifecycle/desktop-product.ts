declare const __DESKTOP_PRODUCT__: { name: string; githubRepository: string }

export const desktopProduct =
  typeof __DESKTOP_PRODUCT__ === 'undefined' ? undefined : __DESKTOP_PRODUCT__
export const productRepository = desktopProduct?.githubRepository ?? 'stablyai/orca'
export const productRepositoryUrl = `https://github.com/${productRepository}`
