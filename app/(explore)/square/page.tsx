import FeedStream from "@/components/square/FeedStream";

/**
 * 虚拟广场。
 *
 * 广场的主角是「已经做完的镜像讨论组」：每个问题都已经跑完一轮
 * 分身作答 + 互相回应 + 缺口盘点，点开就能看这十几位答主怎么答的。
 *
 * 所以这里不做任何介绍、不留说明小字 —— 进来就是流。
 * 标题是唯一的一句话，不加句号，不加解释。
 */
export default function SquarePage() {
  return (
    <section style={{ paddingTop: 40 }}>
      <h1 className="no-tail" style={{ marginBottom: 24 }}>
        这座虚拟知乎里
        <br />
        已经讨论过的事
      </h1>
      <FeedStream hotLimit={20} />
    </section>
  );
}
