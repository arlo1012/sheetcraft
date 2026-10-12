# 图片来源格式

本地插入、替换及图片填充/轮廓的文件选择共享真实内容预检。文件名、扩展名和声明
MIME 只是选择提示，不能跳过字节、尺寸或资源验证。支持 PNG、JPEG、GIF、WebP，
以及下述有界 BMP 和静态 SVG；TIFF、HEIC/HEIF、EMF、WMF 仍不支持。

## 共同边界

- 编码数据最多 10 MiB，单边最多 16,384 像素，总像素最多 33,554,432。读取后的实际
  长度和解码后的尺寸都会重新检查；无效来源在创建解码 URL 前拒绝。
- BMP 与已有光栅格式保留验证过的原始字节。SVG 只有在需要补足独立视口时才规范化
  根尺寸；规范化后的内容参与资产身份、存储和后续预检，不暗中重编码成 PNG。
- 预检通过后仍需平台图片解码器成功。失败会释放临时 URL 并保留原文档，提供格式或
  缩小/简化建议。头部与结构预算不保证平台解码器或多图文档的总内存。
- 新源格式不改变图片框、组内所有者、异步旧请求或保护权限合同，也不扩展工作簿
  文件交换能力。所有者改变后晚到的加载或错误不会写入新目标。

## BMP

接受独立 BM 文件的 12、40、108、124 字节 DIB 头：CORE 的 1/4/8/24 位以及其它
头的 1/4/8/16/24/32 位，使用未压缩 BI_RGB 或 16/32 位 BI_BITFIELDS。支持合法
自下向上/自上向下存储与部分调色板；完整像素行、DWORD 步长、调色板使用范围及
连续、互不重叠的位掩码均须有效。

RLE、嵌入 JPEG/PNG、未知 DIB、外部或嵌入色彩配置文件当前拒绝，不传给另一个
无界解码器。提示建议另存为 PNG/JPEG。BMP 依据
[Microsoft 位图存储](https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-storage)、
[BITMAPINFOHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader)
及 [BITMAPCOREHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapcoreheader)。

## 静态 SVG

接受自包含、UTF-8 的有限静态 SVG：基本路径/图形、文本、分组、局部 use 引用、
线性/径向渐变、裁剪及显式用户空间遮罩，还有白名单中的静态内联/样式表属性。
保留受支持文本与样式，不靠删除不认识的节点来伪装正确输出。

- 脚本、事件属性、外部 URL、xml:base、foreignObject、链接、动画、DTD、自定义实体、
  样式导入及字体资源加载拒绝；引用只能指向本文档中的有效对象。
- 滤镜、嵌入图片、图案、嵌套 SVG、未知元素/属性、未支持 CSS 语法或遮罩方式会明确
  拒绝，并建议导出更简单的自包含静态 SVG 或 PNG。这不是任意 SVG 兼容性承诺。
- 结构深度、节点、文本、数值/路径规模、局部引用展开、变换、虚线绘制工作及离屏
  图层面积都有额外预算；重复引用与继承样式也计入，不仅检查原始 XML 节点数量。
  离屏图层预算是按裁剪视口保守估算的工作量，不能证明平台内部的实际峰值内存。
- 有固定尺寸时按 96 dpi 解析受支持的绝对单位。viewBox 表示坐标系及比例，不被猜成
  像素尺寸。缺失/百分比/auto 尺寸会在默认 300×150 视口内按有效比例确定独立尺寸，
  或由一个有效固定轴推导另一轴；随后写入明确像素根尺寸，保留其它受支持内容。
  无法确定合法视口或超预算时拒绝。

该子集沿用 [SVG 安全静态模式](https://www.w3.org/TR/SVG2/conform.html#secure-static-mode)
的资源约束，并按 [SVG 固有尺寸规则](https://www.w3.org/TR/SVG2/coords.html#IntrinsicSizing)
区分坐标系与显示尺寸。实际功能白名单和预算进一步收窄上述规范，并不宣称完整实现 SVG 2。
