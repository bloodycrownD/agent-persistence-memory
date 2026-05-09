# 项目结构 - VFS 序列化实现后

## 日期

2026-05-07

## 背景

“虚拟文件系统序列化实现”完成后，项目在 `st-virtual-file-system` 下新增了核心领域、仓储抽象、压缩编解码和应用服务层。需要更新当前项目结构记忆，便于后续迭代快速定位代码边界。

## 结论 / 事实

- 当前核心结构分层为：
  - `src/domain/vfs/`：VFS 领域模型、路径规则、核心行为（含快照导入校验）
  - `src/infra/serialization/`：内容编解码（`plain` / `deflate-base64`）
  - `src/infra/repository/`：快照仓储接口与内存实现
  - `src/infra/persistence/`：快照 parse/serialize schema
  - `src/app/services/vfs/`：面向上层的 VFS 服务门面
- 测试结构新增：
  - `test/vfs-core.spec.ts`
  - `test/vfs-serialization.spec.ts`
  - `test/vfs-service.e2e.spec.ts`
- 本轮实现明确排除版本管理能力：
  - 无 history/rollback/branch/merge 接口
  - `schemaVersion` 仅用于快照结构版本识别

## 影响 / 下一步

- 后续接入 ST 持久化时，只需新增 Repository 适配器，不应改动 `domain/vfs` 语义层。
- 若扩展版本管理，应作为独立上层模块追加，不与基础 VFS Core 耦合。
