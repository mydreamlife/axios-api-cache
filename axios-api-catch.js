class AxiosApiCatch {
  /**
   * @name cacheMap存放接口缓存集合结构
   * @key 构成：拦截中config 中 url + 参数 data + 参数 params + method 作为key
   */
  static cacheMap = new Map() // 存放接口缓存集合
   /**
    * @name tokenExceedMap存放token过期集合结构
    * @key 构成：拦截中config 中 url + 参数 data + 参数 params + method 作为key
    * @key:{
    *   catchTimeout: 时间戳毫秒级别，超过当前时间超过这个时间，就 delete 这条数据
    *   ...response
    * }
    */
  static tokenExceedMap = new Map() // token过期，存放的接口请求集合
  /**
   * @name cancelMap取消请求的集合结构
   * @key 构成：拦截中config 中 url + 参数 data + 参数 params + method 作为key
   * @key:{
   *   apiStatus: 接口请求状态：0 正在请求中；1 请求完成
   *   cancelCallback: 该接口取消请求的回调
   *   ...config
   * }
   */
  static cancelMap = new Map() // 存放不同接口取消请求的集合
  static options
  static interceptorsResponseSuccessCallback
  static interceptorsResponseErrorCallback
  static CancelToken
  static refreshList = []
  static refreshToken
  static $axios
  constructor(axios,createAxios,options){
    const defaultOptions = {
      isGetCatch: true, // 全局默认get请求不缓存, 如果不需要缓存，请再请求头中添加 isGetCatch: false
      isPostCatch: false, // 全局默认post请求不缓存，如果需要缓存，请再请求头中添加 isPostCatch: true
      isCancelToken: true, // 全局默认开启取消请求，如果某个接口不许呀，请在请求头中添加 isCancelToken: false
      cancelApiKeyList: [], // 前提是全局开启取消请求或者对单独接口设置isCancelToken：true 由于Map中key定义规则为：url + 参数 data + 参数 params + method 作为key，但有些接口不需要参数来确定唯一key，例如：热搜索，其搜索参数为实时变化，因此只需要url+method作为Map中的唯一key即可
      size: 50, // 默认缓存大小 50条
      isRefreshToken: false, // 默认关闭刷新token机制
      headerTokenKey: 'Authorization', // 接口响应头需要携带token的字段默认为：Authorization
      tokenCode: [401,302], // token失效后的code状态，默认 401和302
      noRefreshUri: [], // 不需要refreshToken的uri
      catchTimeout: 60 * 60 * 1000 // 缓存有效时长默认为 1个小时
    }
    this.options = {
      ...defaultOptions,
      ...options
    }
    ApiCatch.options = this.options
    ApiCatch.CancelToken = axios.CancelToken
    ApiCatch.refreshToken = options?.refreshToken
    if(options.isRefreshToken&&!ApiCatch.refreshToken){
      throw new Error('请重写refreshToken函数逻辑, 需要返回Promise，并且成功回调中需要传入刷新后的token。resolve(token)')
    }
    this.$axios = axios.create(createAxios)
    ApiCatch.$axios = axios.create(createAxios)
  }
  /**
   * @name 公共静态方法相关
   * **/
  static setMap(objName,key,value){
    return ApiCatch[objName].set(key,value)
  }
  static deleteMap(objName,key){
    return ApiCatch[objName].delete(key)
  }
  static getMap(objName,key){
    return ApiCatch[objName].get(key)
  }
  static clearMap(objName){
    return ApiCatch[objName].clear()
  }
  static hasMap(objName,key){
    return ApiCatch[objName].has(key)
  }
  static sizeMap(objName){
    return ApiCatch[objName].size
  }
  static createMapKey(config){ // 创建map的唯一key
    return `${config.url}|data=${JSON.stringify(config.data)}&params=${JSON.stringify(config.params)}&method=${config.method}`
  }
  static clearCancel(){
    // 取消全部请求
    const cancelMapKeyList = [...ApiCatch.cancelMap.keys()]
    cancelMapKeyList.map(item=>{
      const cancelMapData = ApiCatch.getMap('cancelMap',item)
      cancelMapData.cancelCallback()
      ApiCatch.deleteMap('cancelMap',item)
    })
  }
  clearCancel(){
    // 取消全部请求
    const cancelMapKeyList = [...ApiCatch.cancelMap.keys()]
    cancelMapKeyList.map(item=>{
      const cancelMapData = ApiCatch.getMap('cancelMap',item)
      cancelMapData.cancelCallback()
      ApiCatch.deleteMap('cancelMap',item)
    })
  }
  /**
   * @name 缓存相关
   * **/
  static setCacheMap(config, response){ // 设置 缓存集合
    if(ApiCatch.sizeMap('cacheMap')>ApiCatch.options.size){ // 先判断集合是否超过设置的最大值
      ApiCatch.deleteMap('cacheMap',[...ApiCatch.cacheMap.keys()][0])
    }
    const { method, isGetCatch } = config
    if(isGetCatch || method.toLowerCase()==='get' ? ApiCatch.options.isGetCatch : ApiCatch.options.isPostCatch){
      ApiCatch.setMap('cacheMap', ApiCatch.createMapKey(config), response)
    }
  }
  static isCacheApi(config){ // 1.是否有缓存 2.缓存已经超过，过期时间
    // 该请求是否存在缓存
    const createMapKey =  ApiCatch.createMapKey(config)
    if(ApiCatch.hasMap('cacheMap', createMapKey)){ // 1
      // 2
      const catchApiData = ApiCatch.getMap('cacheMap', createMapKey)
      if(catchApiData.catchTimeout<=new Date().getTime()){
        ApiCatch.deleteMap('cacheMap', createMapKey)
        return false
      }else{
        return true
      }
    }else{
      return false
    }
  }
  /**
   * @name 提前取消请求相关
   * **/
  static setCancelMapApi(config){ // 1.是否存再正在请求接口
    const createMapKey =  ApiCatch.cancelMapKey(config)
    ApiCatch.setMap('cancelMap', createMapKey, config)
  }
  static deleteCancelMapApi(config){ // 1.是否存再正在请求接口
    const createMapKey =  ApiCatch.cancelMapKey(config)
    ApiCatch.deleteMap('cancelMap', createMapKey)
  }
  static isCancelMapApi(config){ // 1.是否存再正在请求接口
    const createMapKey =  ApiCatch.cancelMapKey(config)
    return ApiCatch.hasMap('cancelMap', createMapKey)
  }
  static cancelMapKey (config){
    if(ApiCatch.options.cancelApiKeyList.includes(config.url)){
      return `${config.url}|method=${config.method}`
    }else{
      return ApiCatch.createMapKey(config)
    }
  }
  static cancelMapFlow(config){
    // 开启取消请求条件
    // options.isCancelToken true 
    if(config?.isCancelToken || ApiCatch.options.isCancelToken){
      if(ApiCatch.isCancelMapApi(config)){
        // 该接口有正在请求的 cancelMap
        const cancelMapData = ApiCatch.getMap('cancelMap', ApiCatch.cancelMapKey(config))
        cancelMapData.cancelCallback()
        ApiCatch.deleteCancelMapApi(config)
      }
      // 创建cancelMap提前取消请求集合
      config.apiStatus = 0
      config.cancelToken = new ApiCatch.CancelToken((cancelCallback) => {
        config.cancelCallback = cancelCallback
        ApiCatch.setCancelMapApi(config)
      })
    }
  }
  /**
   * @name 刷新token相关
   * **/
  static ifRefreshToken(data){
    const url = data.config.url
    return ApiCatch.options.isRefreshToken&&ApiCatch.options.tokenCode.includes(data?.response?.status || data?.status || data?.data?.status)&&!ApiCatch.options.noRefreshUri.includes(url)
  }
  static refreshTokenFlow(data){
    if(!ApiCatch.refreshList.length){
      ApiCatch.refreshToken().then(
        async token => {
          ApiCatch.clearMap('cacheMap')
          await ApiCatch.refreshList.forEach(cb => cb(token))
          ApiCatch.refreshList=[]
        },
        () => {
          ApiCatch.clearMap('cacheMap')
          ApiCatch.refreshList=[]
        }
      )
    }
    return new Promise((resolve)=>{
      ApiCatch.refreshList.push((token)=>{
        data.config.headers[ApiCatch.options.headerTokenKey] = token
        resolve(ApiCatch.$axios(data.config))
      })
    })
  }
  /**
   * @name axios相关
   * **/
  axiosOptions(callback){
    callback&&callback(this.$axios)
  }
  interceptorsRequest(successCallback,errCallback){ // 请求拦截
    return this.$axios.interceptors.request.use(
      config => {
        ApiCatch.cancelMapFlow(config)
        if(successCallback){
          return successCallback(config)
        }
        return config
      },
      error => {
        if(errCallback) {
          return errCallback(error)
        }
        return Promise.reject(error)
      }
    )
  }
  interceptorsResponse(successCallback,errCallback){ // 响应拦截
    return this.$axios.interceptors.response.use(
      response => {
        if(!ApiCatch.isCacheApi(response.config)){
          // 没有缓存或缓存过期
          // 设置该请求缓存过期时间
          response.catchTimeout = new Date().getTime() + (response.config?.catchTimeout ? response.config?.catchTimeout : ApiCatch.options.catchTimeout)
          ApiCatch.setCacheMap(response.config, response)
        }
        if(ApiCatch.isCancelMapApi(response.config)){ // 删除该请求在cancelMap的数据
          ApiCatch.deleteCancelMapApi(response.config)
        }
        // token刷新
        if(ApiCatch.ifRefreshToken(response)){
          return ApiCatch.refreshTokenFlow(response)
        }
        if(successCallback){
          ApiCatch.interceptorsResponseSuccessCallback = successCallback
          return successCallback(response)
        }
        return Promise.resolve(data)
      },
      error => {
        // token刷新
        if(ApiCatch.ifRefreshToken(error)){
          return ApiCatch.refreshTokenFlow(error)
        }
        if(errCallback) {
          ApiCatch.interceptorsResponseErrorCallback = errCallback
          return errCallback(error)
        }
        return Promise.reject(error)
      }
    )
  }
  get(url, params = '', other = {}){
    const config = {
      url,
      params,
      ...other,
      data: other?.data,
      method: 'get'
    }
    return new Promise((resolve, reject) => {
      if(ApiCatch.isCacheApi(config)){
        // 有缓存
        const catchApiData = ApiCatch.getMap('cacheMap', ApiCatch.createMapKey(config))
        if(catchApiData.status === 200){
          if(ApiCatch.interceptorsResponseSuccessCallback){
            resolve(ApiCatch.interceptorsResponseSuccessCallback(catchApiData))
            return
          }
          resolve(catchApiData)
        }else{
          if(ApiCatch.interceptorsResponseErrorCallback){
            resolve(ApiCatch.interceptorsResponseErrorCallback(catchApiData))
            return
          }
          reject(catchApiData)
        }
      }else{
        // 无缓存
        this.$axios.get( url, {
          params,
          ...other
        }).then(res => {
          resolve(res)
        })
        .catch(err => {
          reject(err)
        })
      }
    })
    
  }
  post(url, data = {}, other){
    const config = {
      url,
      data,
      ...other,
      params: other?.params,
      method: 'post'
    }
    return new Promise((resolve, reject) => {
      if(ApiCatch.isCacheApi(config)){
        // 有缓存
        const catchApiData = ApiCatch.getMap('cacheMap', ApiCatch.createMapKey(config))
        if(catchApiData.status === 200){
          if(ApiCatch.interceptorsResponseSuccessCallback){
            resolve(ApiCatch.interceptorsResponseSuccessCallback(catchApiData))
            return
          }
          resolve(catchApiData)
        }else{
          if(ApiCatch.interceptorsResponseErrorCallback){
            resolve(ApiCatch.interceptorsResponseErrorCallback(catchApiData))
            return
          }
          reject(catchApiData)
        }
      }else{
        // 无缓存
        this.$axios.post( url, data, other).then(res => {
          resolve(res)
        })
        .catch(err => {
          reject(err)
        })
      }
    })
  }
}

module.exports = {
  AxiosApiCatch
}
