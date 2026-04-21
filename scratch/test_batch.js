
const text = "你好\n世界";
const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=pt&dt=t&dt=rm&q=${encodeURIComponent(text)}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => console.error(err));
