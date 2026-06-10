const fs = require("fs");
const path = require("path");

const NODE_ENV = process.env.NODE_ENV || "development";
const NODE_PLATFORM = process.env.NODE_PLATFORM || "WIN";
const VERSION = process.env.npm_config_setv

updatePackJson()
if(NODE_ENV == "production") {
    updateBuildProdJson()
}
updateProdLockJson()
updateConfigJson()

function updatePackJson() {
    const packageJsonUrl = path.join(process.cwd(), "package.json");
    const packageJsonStr = fs.readFileSync(packageJsonUrl, "utf-8");
    const packageJson = JSON.parse(packageJsonStr);
    try {
        packageJson.version = VERSION || packageJson.version;
        fs.writeFileSync(packageJsonUrl, JSON.stringify(packageJson, null, 2));
    } catch (error) {
        console.log("error", error);
    }
}

function updateBuildProdJson() {
    const filelist = ["build/builder.prod.json", "build/builder.prod.ios.json"]
    filelist.map((file) => {
      const buildProdUrl = path.join(process.cwd(), file)
      const buildProdStr = fs.readFileSync(buildProdUrl, "utf-8");
      const buildProdJson = JSON.parse(buildProdStr);
      try {
          buildProdJson.releaseInfo.releaseNotesFile = `release/release-${VERSION}.md`;
          fs.writeFileSync(buildProdUrl, JSON.stringify(buildProdJson, null, 2));
      } catch (error) {
          console.log("error", error);
      }
    })
}


function updateProdLockJson() {
    const packageLockJsonUrl = path.join(process.cwd(), "package-lock.json");
    const packageLockJsonStr = fs.readFileSync(packageLockJsonUrl, "utf-8");
    const packageLockJson = JSON.parse(packageLockJsonStr);
    try {
        packageLockJson.version = VERSION || packageLockJson.version;
        packageLockJson.packages[""].version = VERSION || packageLockJson.packages[""].version;
        fs.writeFileSync(packageLockJsonUrl, JSON.stringify(packageLockJson, null, 2));
    } catch (error) {
        console.log("error", error);
    }
}

function updateConfigJson() {
    const configJsonUrl = path.join(process.cwd(), "src/utils/config.json");
    const configJsonStr = fs.readFileSync(configJsonUrl, "utf-8");
    const configJson = JSON.parse(configJsonStr);
    try {
        configJson.version = VERSION;
        fs.writeFileSync(configJsonUrl, JSON.stringify(configJson, null, 2));
    } catch (error) {
        console.log("error", error);
    }
}
