/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // distDir 可由环境变量覆盖，用于**原子部署**：
  //   构建时 NEXT_DIST_DIR=.next.new  → 产物写到独立目录，线上 .next 全程不动
  //   运行时不设该变量           → 仍然读 .next，运行方式完全不变
  //
  // 为什么必须固定名字、不能用带时间戳的目录：
  //   Next 14 会把 `<distDir>/types/**/*.ts` **追加**进 tsconfig.json 的 include
  //   （实测：同名重复构建是幂等的；换一个 distDir 就多一条）。
  //   每次部署换名字 → include 无限增长，且在服务器 git reset --hard 后
  //   会把 tsconfig.json 弄脏、污染后续 diff。所以固定成 .next.new。
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = nextConfig;
