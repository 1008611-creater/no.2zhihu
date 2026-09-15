import { redirect } from "next/navigation";

/**
 * 「我的 Mesh」不再是独立 tab —— 它成了「我的」下的一个视图。
 *
 * 保留这条路由只为不打断已经存在的链接：工作台的「去我的 Mesh 一键搬回知乎」、
 * 真人补充页的「查看 Mesh 变化」都指过这里，外部也可能有人存了书签。
 * 与其留下一份会和 /me 各自过期的第二实现，不如在这里做一次跳转。
 */
export default function MeshRedirect() {
  redirect("/me?tab=mesh");
}
