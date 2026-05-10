/requirement-review 
当前是一个cli应用，名字叫agent-persistence-memory，也就是agent外置记忆应用。

现在讲讲我的设计哈，先说命令设计：
## apm read 
读取记忆

读取的记忆分成多个部分，就像一份完整的prompt：



```markdown
# 角色
[此部分是角色自身的定义，简短，但是明确。50 ~ 100字左右]{role区域}

# 持久化记忆
[一些简短但是重要的信息，比如项目结构（文件树）与功能，比如一些文件/文件夹的索引，比如一些用户要求的很重要的规则。300 ~ 500字左右。]{persistence区域}

## 持久化关联
[5 ~ 10个关键词，关键词之间用逗号分隔。表示持久化记忆关联的关键词。]{自动生成}

# 当前记忆(也可以认为是临时记忆，此处内容会经常性变动)

## todos
[任务列表，5 ~ 10条，每条任务不超过100字。表示当前完成或者未完成的任务]{todos区域}

## 当前任务明细
[上次时间]{自动生成}
[当前时间]{自动生成}
[当前任务详细描述，500 ~ 1000字左右，比如任务的背景、目标、待确认项等。]{自动生成，优先级顺排第一个未完成任务}
[当前任务执行进度，产生的影响，遇到的困难，如何解决的等等]{detail区域}

# 联想区

## 联想记忆
[3 ~ 5个记忆片段，分段切割，每段不超过200字。表示当前任务执行过程中，想到的与当前任务相关的记忆。]

## 联想关键词
[5 ~ 10个关键词，关键词之间用逗号分隔。表示当前任务执行过程中，想到的与当前任务相关的关键词。]


```

## apm role

apm role show 读取当前角色设置,格式如下
```
1| xxx
2|xxx
3|xxx
...
```
有行号，行号从1开始，便于编辑。

apm role write <text> 写入角色设置
apm role edit <text> --start <startLine> --end <endLine> 编辑角色设置

## apm persist
读取持久化记忆

apm persist show 读取持久化记忆，同role

apm persist write <text> 写入持久化记忆
apm persist edit <text> --start <startLine> --end <endLine> 编辑持久化记忆

## apm tmp

### apm tmp show 
读取临时记忆，同role

### apm tmp todos
apm tmp todos show 读取临时记忆中的任务列表，同role
apm tmp todos add --name <name> --description <description> 添加任务
apm tmp todos rm --index <index> 删除任务
apm tmp todos edit --index <index> --name <name> --description <description> 编辑任务
apm tmp todos clear 清空任务列表
apm tmp todos list 列出任务列表
apm tmp todos complete --index <index> 完成任务
apm tmp todos priority --index <index> --priority <priority> 设置任务优先级

### apm tmp detail[当前任务执行进度，产生的影响，遇到的困难，如何解决的等等]
apm tmp detail show 读取临时记忆中的任务明细，同role
apm tmp detail write <text> 写入任务明细
apm tmp detail edit <text> --start <startLine> --end <endLine> 编辑任务明细

### apm chunks 
读取联想区记忆
apm chunks list [--size <size>] [--page <page>] [--desc/asc <field>]列出联想区记忆，默认每页10条，默认页码为1
格式，注意对齐

```
=============================================================
总计数量：100
=============================================================
name  keywords     createdAt            updatedAt
xxx   xxx, y, z    2026-05-09 10:00:00  2026-05-09 10:00:00
yyy   y, z, a      2026-05-09 10:00:00  2026-05-09 10:00:00
...
```


apm chunks add --text <text> --keywords <keywords> --name <name> 添加联想区记忆,keywords用逗号分隔
apm chunks rm --name <name> 删除联想区记忆
apm chunks edit --name <name> --text <text> --keywords <keywords> 编辑/更新联想区记忆
apm chunks search [--keywords <keywords>] [--content <content>] [--name <name>] 搜索联想区记忆，几个条件选一个，keywords/name都是模糊搜索
apm chunks read name1,name2,name3 读取联想区记忆的详情，name用逗号分隔
格式
```
=============================================================
name: xxx createdAt: 2026-05-09 10:00:00 updatedAt: 2026-05-09 10:00:00
keywords:
text:

xxxxxxxxxxxxx
xxxxxxxxxxxwwwwwwwww

================================================================
name: yyyy createdAt: 2026-05-09 10:00:00 updatedAt: 2026-05-09 10:00:00
keywords:
text:

xxxxxxxxxxxxx
xxxxxxxxxxxwwwwwwwww
...
```

然后是项目存储，读取当前命令执行目录下的.apm目录

.apm/
- config.json
- status.json
- chunks/
  - xxx.md(front matter + content,front matter格式为yaml，有name,keywords,createdAt,updatedAt字段)

- persistence/
  - memory.md(front matter + content,front matter格式为yaml，有name,keywords,createdAt,updatedAt字段)
- tmp/
  - todos/
    - xxx.md(front matter + content,front matter格式为yaml，有name,index,priority,createdAt,updatedAt字段)
  - detail.md