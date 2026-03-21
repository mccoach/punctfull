---
title: Regression Test Document
author: PunctFull
created: 2026-03-21
tags:
  - markdown
  - regression
  - punctuation
---

# 标点整理系统全功能回归测试文档

> 目的：用于校验所有功能是否完好回归，尤其是保护区、加粗修复、链接/图片豁免、编号点号保护等。

---

## 1. 基础标点转换

以下内容在中文语境中，半角基础标点应被转换：

这是中文句子, 应该把逗号转为全角.
这是中文句子; 应该把分号转为全角.
这是中文句子: 应该把冒号转为全角.
这是中文句子? 应该把问号转为全角!
这是中文句子. 这里句号也应该转为全角。

以下内容在英文语境中，通常不应乱转：

This is an English sentence, and should mostly stay unchanged.
English only: hello, world. how are you?
API response: ok, done; next: run.
Just ASCII symbols: a,b;c:d?e!f.

---

## 2. 省略号转换

中文语境中，以下英文省略号应转为中文省略号：

他说...这件事以后再谈....
我想了很久......还是决定这样做。

英文/技术内容中不应误伤：

Version...maybe
Wait... no...
file...name
a...b...c

---

## 3. 连续/组合标点转换

这些在中文语境中应转换：

太好了!!!
你在干什么???
这是真的吗?!
这样也行!?
不会吧!!??
真的么??!!

这些技术内容或保护区不应误伤：

wow!!!really
if (a != b) return!?;
path/what?!/ok
emoji tag :warning:

---

## 4. 破折号转换

中文语境中，恰好两个连字符应转中文破折号：

他说--这不是重点。
这个概念--如果你能理解--就很好。
这里是中文 -- 应该转。
测试--结束

以下不应转换：

---
----
a--b
param--name
value--1
__init__--x
CLI 参数 --help 不应破坏（这里尤其注意技术语境）
command--option

---

## 5. 引号转换

中文语境中，英文引号应转换：

他说"这是一个测试".
她回答'可以开始了'.
“已有中文上下文时，"双引号"也应正常工作。”
这里有单引号: '测试一下'

英文 apostrophe 不应误判：

don't stop
I'm here
we're testing
it's fine

### 5.1 双引号奇数回退

下面这一段双引号数量是奇数，应跳过并标记原因：

这是一个"奇数双引号测试，后面没有闭合。

### 5.2 单引号奇数回退

下面这一段单引号数量是奇数，应跳过并标记原因：

这是一个'奇数单引号测试，后面也没有闭合。

---

## 6. 括号语义转换

以下括号是“短中文解释”，应转换：

这是一个术语(解释说明)。
这里有概念(简短注释)方便理解。
中文上下文里的(补充说明)应尽量转。

以下不应转换：

API(test)
HTTP(x64)
函数(foo_bar)
路径(C:\Users\Test)
技术内容(a_b_c)
look (like code)
English (comment)
这段里有 ⟦A0⟧ 伪标记也不要乱动

### 6.1 ASCII 括号奇数回退标记

以下括号不成对，应只标记跳过，不强行改：

这是一个不成对的圆括号（示意 (
这是一个不成对的方括号 [
这是一个不成对的花括号 {

---

## 7. Markdown 加粗符号修复

### 7.1 去掉加粗内侧非法空格

这是 ** 符号**
这是 **符号 **
这是 ** 符号 **
这里有一段 ** 测试文本 ** 应修正。

### 7.2 左端规则：左 ** 后面是非文字，则左侧也应是非文字，否则补空格

测试**，说明**
A**（示例）**
3**!重要**
中文**：提示**
abc**？问题**

### 7.3 右端规则：右 ** 前面是非文字，则右侧也应是非文字，否则补空格

**说明，**测试
**示例）**A
**重要!**3
**提示：**中文
**问题？**abc

### 7.4 左右两端可分别成立

测试**，说明**完成
A**（示例文本）**结束
中文**：提示信息！**abc

### 7.5 正常合法加粗不应被破坏

这是 **正常加粗文本** 示例。
这是 **abc123中文** 示例。
前后都有空格的 **正常内容** 不应乱改。
行首的**加粗符号内容**如果本来合法，也不要改坏。

---

## 8. Markdown 图片与链接保护

### 8.1 图片整段必须保护

![关系建立模块：九项才干的关系编织链](2026-03-21-09-46-20.png)
![图片标题, 带逗号. 带句号: 带冒号!](assets/example-image.v1.2.png)
![中文说明（括号）和"引号"](./images/demo(test)-v2.0.png)

### 8.2 普通链接地址必须保护

[普通链接](https://example.com/a,b;c:d?e=f&g=h)
[带标题文字的链接：这里有, . : ; ? !](https://example.com/docs/v1.2/index.html)
[本地路径链接](../assets/docs/readme.v1.0.md)
[Windows 路径风格](C:\Docs\Test\file.v2.3.txt)

### 8.3 链接显示文字可以按正文规则处理，但地址不能坏

这是一个[链接标题, 应按正文观察](https://example.com/a,b;c:d)
这里是[标题: 带冒号](https://example.com/path/file.name)
这里是[标题（括号）](https://example.com/test_(abc).html)

---

## 9. Markdown 有序列表 / 编号点号保护

这些点号不能变成中文句号：

1. 第一项
2. 第二项
10. 第十项
123. 编号项目

### 9.1 标题中的编号样式也不能误改

## 1. 核心感觉：对“破损”的敏感
### 2.1 小节标题（注意这里 2.1 也不应乱改）
#### 3. 第三级标题编号形式

### 9.2 正文中的编号样式

请看第 2. 节内容。
先完成 1. 准备阶段，再进入 2. 执行阶段。
本章包含 3. 结构、4. 流程、5. 风险三部分。

### 9.3 小数和版本号也不应误改

版本 v1.2 已发布。
当前数值为 3.14，后续调整到 2.50。
Python 3.11 很常见。
Node.js 20.1 可正常工作。

---

## 10. B 区技术片段保护

以下内容都应保护，不应误改：

URL: https://example.com/a,b;c:d?e=f
EMAIL: user.name+tag@example-domain.com
IPV4: 192.168.0.1
TIME: 12:30 / 01:02:03
DATE: 2026-03-21
THOUSANDS: 1,234,567.89
DECIMAL: 0.618 / 3.14159
PATH: ./docs/test-file_v1.2/readme.md
PATH: ../assets/img/demo.png
PATH: ~/work/project/src/index.ts
PATH: C:\Program Files\App\readme.txt
DOMAIN: sub.example.com
FILENAME: archive.tar.gz
VERSION: v2.3.1-beta

这些内容附近即使有中文，也不应被误改：
请访问 https://example.com/a,b;c:d?e=f 查看说明.
联系邮箱 user.name+tag@example-domain.com 获取信息.
配置文件是 archive.tar.gz ，不要改坏.
程序版本 v2.3.1-beta 已经发布.

---

## 11. A 区保护：代码块 / 行内代码 / 数学公式 / HTML / 注释

### 11.1 YAML front matter 已在文档顶部

### 11.2 fenced code block

```js
const a = "hello, world...";
const b = value--1;
function test(x, y) {
  return x != y ? "ok!" : "wait...";
}
console.log("quote:", '"', "'");
