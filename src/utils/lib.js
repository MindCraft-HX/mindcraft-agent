//BUG:
// 在lib.js中
const execKeilCmd = async (compilerPath, projectPath, dir) => {
    return new Promise((resolve, reject) => {
      const cmd = `\"${compilerPath}\" -b \"${projectPath}\" -j0`;
      console.log('cmd', cmd);
      const outPath = joint.join(dir, 'out');

      window.electronAPI.execCmd(cmd, dir)
        .then((process) => {
          console.log('process', process);

          process.stdout.on('data', (data) => {
            console.log('stdout', data);
          });

          process.stderr.on('data', (data) => {
            console.log('stderr', data);
          });

          process.on('close', (code) => {
            if (code > 1) {
              resolve({ status: 1, outPath, msg: `字库lib文件, 编译出现错误, code: ${code}.` });
            } else {
              resolve({ status: 0, outPath, msg: `字库lib文件, 编译成功。`});
            }
          });
        })
        .catch((error) => {
          reject({ status: 1, msg: `执行命令时发生错误: ${error.message}` });
        });
    });
  };

export default execKeilCmd;
