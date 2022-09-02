1、npm i axios-api-cache
2、使用
``` js
// filePath: axiosConfig.js
// 1、 其中只封装了get和post的方法
// url 为请求地址，params 为get请求参数，other为其他配置，例如设置header等
// window.apicacheInstance.get(url,params,other={})
// window.apicacheInstance.post(url,params,other={})
// 2、如果想使用axios原始请求
// window.apicacheInstance.$axios 即可，但这样无法使用本缓存，取消请求，和refreshToekn可以正常使用，不建议这样使用
// 3、如果在切换路由时需要取消全部正在请求的接口
// 在路由守卫中调用 window.apicacheInstance.clearCancel()方法

import axios from 'axios'
const Apicache = require('axios-api-cache')
// 其中第二个参数axiosCreateOptions为  axios.create()中配置
const axiosCreateOptions = {}
window.apicacheInstance = new Apicache.Apicache(axios,axiosCreateOptions,{
  isGetcache: true, // 全局默认get请求不缓存, 如果不需要缓存，请再请求头中添加 isGetcache: false
  isPostcache: false, // 全局默认post请求不缓存，如果需要缓存，请再请求头中添加 isPostcache: true
  isCancelToken: true, // 全局默认开启取消请求，如果某个接口不许呀，请在请求头中添加 isCancelToken: false
  cancelApiKeyList: [], // 前提是全局开启取消请求或者对单独接口设置isCancelToken：true 由于Map中key定义规则为：url + 参数 data + 参数 params + method 作为key，但有些接口不需要参数来确定唯一key，例如：热搜索，其搜索参数为实时变化，因此只需要url+method作为Map中的唯一key即可
  size: 50, // 默认缓存大小 50条
  isRefreshToken: false, // 默认关闭刷新token机制
  headerTokenKey: 'Authorization', // 接口响应头需要携带token的字段默认为：Authorization
  tokenCode: [401,302], // token失效后的code状态，默认 401和302
  noRefreshUri: [], // 不需要refreshToken的uri
  cacheTimeout: 60 * 60 * 1000, // 缓存有效时长默认为 1个小时
  refreshToken(){ // refreshToken函数逻辑, 需要返回Promise，并且成功回调中需要传入刷新后的token。resolve(token)
    // 此处只是一个使用示例
    return 
  }
})

// 基于axios.interceptors.request.use()封装的请求拦截
window.apicacheInstance.interceptorsRequest(
  config => {
    return config
  },
  () => { // 异常回调处理，如果没有，则可以不传

  }
)
// 基于axios.interceptors.response.use()封装的响应拦截
window.apicacheInstance.interceptorsResponse( // 如果业务没有响应拦截处理，此方法可以无需定义
  response => {
    return Promise.resolve(response)
  },
  error => { // 异常回调处理，如果没有，则可以不传
    return Promise.reject(error)
  }
)

export default window.apicacheInstance
```