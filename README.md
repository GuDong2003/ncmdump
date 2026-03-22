# ncmdump

将网易云音乐缓存文件 `*.ncm` 转换为可播放的 `mp3` 或 `flac`。

本仓库保留原始 C++ 命令行工具与动态库能力，同时新增了一个可直接部署到 GitHub Pages 的浏览器版前端页面。

## 项目来源

本仓库会继续保留原作者和前序维护者信息。

- 最早的源码复刻自 `anonymous5l/ncmdump`（原仓库已删除）
- 跨平台 C++ 版本由 `taurusxin/ncmdump` 持续整理、移植与维护
- 当前仓库 `GuDong2003/ncmdump` 基于上述项目继续维护，并补充了 Web UI、Pages 部署与部分稳定性修复

感谢原作者与前序维护者的工作。

## 这个仓库新增了什么

- 保留原有 CLI / DLL 用法
- 新增 GitHub Pages 静态网页，支持在浏览器中本地解码 `.ncm`
- 新增中文前端 UI，支持拖拽上传、结果统计、封面提取、音频试听与下载
- 补充 Pages 自动部署工作流
- 修复部分稳定性问题，例如 TagLib 释放方式与 cJSON 空指针保护

## 使用方式

注意：网易云音乐 3.0 之后的某些版本，下载的 ncm 文件可能不内置封面图片；这种情况下浏览器版和当前 CLI 都无法凭空补齐封面数据。若你需要自动联网补全封面，可以参考 `ncmdump-go` / `ncmdump-gui` 一类的后续实现思路。

### 浏览器版 Web UI

仓库提供了一个纯静态页面，代码位于 `docs` 目录，可直接部署到 GitHub Pages：

- 在线地址：`https://gudong2003.github.io/ncmdump/`
- 所有解码都在浏览器本地完成，不上传文件
- 支持批量拖拽 `.ncm` 文件
- 支持导出音频、提取封面、查看歌曲基础信息、直接试听
- 当前网页版本不会像原生 CLI 一样把 ID3 / FLAC 标签重新写回输出文件

### 命令行工具

从当前仓库的 Releases 页面下载已编译好的版本：

- Release：`https://github.com/GuDong2003/ncmdump/releases`

常用命令：

```shell
# 帮助
ncmdump -h

# 版本信息
ncmdump -v

# 处理单个或多个文件
ncmdump 1.ncm 2.ncm

# 处理目录
ncmdump -d source_dir

# 递归处理目录
ncmdump -d source_dir -r

# 成功后删除源文件
ncmdump -m

# 输出到指定目录
ncmdump 1.ncm 2.ncm -o output_dir
ncmdump -d source_dir -o output_dir
ncmdump -d source_dir -o output_dir -r
```

### 动态库

如果你想在 C#、Python、Java 等项目中调用本项目，可以使用 `libncmdump` 动态库，示例见 `example` 目录。

注意：Windows 下传递到库构造函数的文件名编码必须为 UTF-8，否则会抛出运行时错误。

## 部署 GitHub Pages

仓库已包含 `.github/workflows/pages.yml`，默认使用 GitHub Actions 部署 `docs` 目录。

### 使用 GitHub Actions

1. 打开仓库 `Settings`
2. 进入 `Pages`
3. `Source` 选择 `GitHub Actions`
4. 推送到 `main` 分支后等待 `Pages` 工作流完成

### 使用 `/docs` 目录

如果你更喜欢传统方式，也可以在仓库设置中把 Pages Source 指向 `main` 分支的 `/docs` 目录。

## 编译项目

克隆当前仓库：

```shell
git clone https://github.com/GuDong2003/ncmdump.git
cd ncmdump
```

### Windows

安装 Visual Studio 2022、CMake，并准备好 C++ 桌面开发环境，再安装 `vcpkg`：

```shell
git clone https://github.com/microsoft/vcpkg.git
cd vcpkg
./bootstrap-vcpkg.bat
```

配置并编译：

```shell
cmake -G "Visual Studio 17 2022" -DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%/scripts/buildsystems/vcpkg.cmake -DVCPKG_TARGET_TRIPLET=x64-windows-static -B build
cmake --build build -j 8 --config Release
```

### macOS

先安装 TagLib：

```shell
brew install taglib
```

然后配置并编译：

```shell
cmake -DCMAKE_BUILD_TYPE=Release -B build
cmake --build build -j$(nproc)
```

### Linux

由于 Ubuntu 24.04 的 TagLib 仍以 1.x 为主，不支持本项目当前的 CMake 依赖方式，所以需要先手动安装 2.x：

```shell
wget https://github.com/taglib/taglib/releases/download/v2.1.1/taglib-2.1.1.tar.gz
tar -xzf taglib-2.1.1.tar.gz && cd taglib-2.1.1
cmake -DCMAKE_INSTALL_PREFIX=/usr/local -DCMAKE_BUILD_TYPE=Release .
make -j$(nproc)
sudo make install
```

回到项目目录后继续构建：

```shell
cmake -DCMAKE_BUILD_TYPE=Release -B build
cmake --build build -j$(nproc)
```

## 构建产物

- CLI 可执行文件会出现在 `build` 目录
- Windows 下还会生成 `libncmdump.dll`
- 具体调用方式可参考 `example` 目录

## 仓库说明

如果你更关心原始 C++ 跨平台实现和历史维护脉络，可以参考：

- 上游维护仓库：`https://github.com/taurusxin/ncmdump`
- 当前仓库：`https://github.com/GuDong2003/ncmdump`

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=GuDong2003/ncmdump&type=Date)](https://star-history.com/#GuDong2003/ncmdump&Date)
