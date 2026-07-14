exports.default = async function notarizing (context) {
  const { notarize } = await import('@electron/notarize');
  const appName = context.packager.appInfo.productFilename
  const {electronPlatformName, appOutDir} = context
  if (electronPlatformName !== 'darwin') {
    return
  }
  // 获取xxx.app 路径
  let appPath = `${appOutDir}/${appName}.app`
  // 您的苹果开发者帐户的用户名
  let appleId = "sales@genitop.com"

      // 应用程序专用密码，每次打包之前需要重新生成,公证完成密码即失效
  // https://account.apple.com/account/manage?ntoDisabled=true
  let appleIdPassword = "mmlh-ecym-nwzd-vkdy"
  // 您要公证的团队ID
  let teamId = "NL954GZL79"
  console.log("appPath ",appPath)

  // Package your app here, and code sign with hardened runtime
  // 指定公证工具为notarytool
  return  await notarize({ tool: 'notarytool',
    appPath,
    appleId,
    appleIdPassword,
    teamId
  });
}
