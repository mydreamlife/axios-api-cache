export class ApiCache {
  /**
   * @name cacheMap存放接口缓存集合结构
   * @key 构成：拦截中config 中 url + 参数 data + 参数 params + method 作为key
   */
  static cacheMap // 存放接口缓存集合
   /**
    * @name tokenExceedMap存放token过期集合结构
    * @key 构成：拦截中config 中 url + 参数 data + 参数 params + method 作为key
    * @key:{
    *   cacheTimeout: 时间戳毫秒级别，超过当前时间超过这个时间，就 delete 这条数据
    *   ...response
    * }
    */
  static tokenExceedMap // token过期，存放的接口请求集合
  /**
   * @name cancelMap取消请求的集合结构
   * @key 构成：拦截中config 中 url + 参数 data + 参数 params + method 作为key
   * @key:{
   *   apiStatus: 接口请求状态：0 正在请求中；1 请求完成
   *   cancelCallback: 该接口取消请求的回调
   *   ...config
   * }
   */
  static cancelMap // 存放不同接口取消请求的集合
  static options
  static interceptorsResponseSuccessCallback
  static interceptorsResponseErrorCallback
  static CancelToken
  static refreshList = []
  static refreshToken
  static $axios
  constructor(axios,createAxios,options){
    const defaultOptions = {
      isGetCache: true, // 全局默认get请求缓存, 如果不需要缓存，请再请求头中添加 isGetCache: false
      isPostCache: false, // 全局默认post请求不缓存，如果需要缓存，请再请求头中添加 isPostCache: true
      isCancelToken: true, // 全局默认开启取消请求，如果某个接口不许呀，请在请求头中添加 isCancelToken: false
      cancelApiKeyList: [], // 前提是全局开启取消请求或者对单独接口设置isCancelToken：true 由于Map中key定义规则为：url + 参数 data + 参数 params + method 作为key，但有些接口不需要参数来确定唯一key，例如：热搜索，其搜索参数为实时变化，因此只需要url+method作为Map中的唯一key即可
      size: 50, // 默认缓存大小 50条
      isRefreshToken: false, // 默认关闭刷新token机制
      headerTokenKey: 'Authorization', // 接口响应头需要携带token的字段默认为：Authorization
      tokenCode: [401,302], // token失效后的code状态，默认 401和302
      noRefreshUri: [], // 不需要refreshToken的uri
      cacheTimeout: 60 * 60 * 1000 // 缓存有效时长默认为 1个小时
    }
    this.options = {
      ...defaultOptions,
      ...options
    }
    ApiCache.cacheMap = new Map()
    ApiCache.tokenExceedMap = new Map()
    ApiCache.cancelMap = new Map()
    ApiCache.options = this.options
    ApiCache.CancelToken = axios.CancelToken
    ApiCache.refreshToken = options?.refreshToken
    if(options.isRefreshToken&&!ApiCache.refreshToken){
      throw new Error('请重写refreshToken函数逻辑, 需要返回Promise，并且成功回调中需要传入刷新后的token。resolve(token)')
    }
    this.$axios = axios.create(createAxios)
    ApiCache.$axios = axios.create(createAxios)
  }
  /**
   * @name 公共静态方法相关
   * **/
  static setMap(objName,key,value){
    return ApiCache[objName].set(key,value)
  }
  static deleteMap(objName,key){
    return ApiCache[objName].delete(key)
  }
  static getMap(objName,key){
    return ApiCache[objName].get(key)
  }
  static clearMap(objName){
    return ApiCache[objName].clear()
  }
  static hasMap(objName,key){
    return ApiCache[objName].has(key)
  }
  static sizeMap(objName){
    return ApiCache[objName].size
  }
  static createMapKey(config){ // 创建map的唯一key
    return `${config.url}|data=${JSON.stringify(config.data)}&params=${JSON.stringify(config.params)}&method=${config.method}`
  }
  clearCancel(){
    // 取消全部请求
    const cancelMapKeyList = [...ApiCache.cancelMap.keys()]
    cancelMapKeyList.map(item=>{
      const cancelMapData = ApiCache.getMap('cancelMap',item)
      cancelMapData.cancelCallback()
      ApiCache.deleteMap('cancelMap',item)
    })
  }
  /**
   * @name 缓存相关
   * **/
  static setCacheMap(config, response){ // 设置 缓存集合
    if(ApiCache.sizeMap('cacheMap')>ApiCache.options.size){ // 先判断集合是否超过设置的最大值
      ApiCache.deleteMap('cacheMap',[...ApiCache.cacheMap.keys()][0])
    }
    const { method, isGetCache } = config
    if(typeof isGetCache !== 'boolean' || isGetCache){
      if(method.toLowerCase()==='get' ? ApiCache.options.isGetCache : ApiCache.options.isPostCache){
        ApiCache.setMap('cacheMap', ApiCache.createMapKey(config), response)
      }
    }
  }
  static isCacheApi(config){ // 1.是否有缓存 2.缓存已经超过，过期时间
    // 该请求是否存在缓存
    const createMapKey =  ApiCache.createMapKey(config)
    if(ApiCache.hasMap('cacheMap', createMapKey)){ // 1
      // 2
      const cacheApiData = ApiCache.getMap('cacheMap', createMapKey)
      if(cacheApiData.cacheTimeout<=new Date().getTime()){
        ApiCache.deleteMap('cacheMap', createMapKey)
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
    const createMapKey =  ApiCache.cancelMapKey(config)
    ApiCache.setMap('cancelMap', createMapKey, config)
  }
  static deleteCancelMapApi(config){ // 1.是否存再正在请求接口
    const createMapKey =  ApiCache.cancelMapKey(config)
    ApiCache.deleteMap('cancelMap', createMapKey)
  }
  static isCancelMapApi(config){ // 1.是否存再正在请求接口
    const createMapKey =  ApiCache.cancelMapKey(config)
    return ApiCache.hasMap('cancelMap', createMapKey)
  }
  static cancelMapKey (config){
    if(ApiCache.options.cancelApiKeyList.includes(config.url)){
      return `${config.url}|method=${config.method}`
    }else{
      return ApiCache.createMapKey(config)
    }
  }
  static cancelMapFlow(config){
    // 开启取消请求条件
    // options.isCancelToken true 
    if(config?.isCancelToken || ApiCache.options.isCancelToken){
      if(ApiCache.isCancelMapApi(config)){
        // 该接口有正在请求的 cancelMap
        const cancelMapData = ApiCache.getMap('cancelMap', ApiCache.cancelMapKey(config))
        cancelMapData.cancelCallback()
        ApiCache.deleteCancelMapApi(config)
      }
      // 创建cancelMap提前取消请求集合
      config.apiStatus = 0
      config.cancelToken = new ApiCache.CancelToken((cancelCallback) => {
        config.cancelCallback = cancelCallback
        ApiCache.setCancelMapApi(config)
      })
    }
  }
  /**
   * @name 刷新token相关
   * **/
  static ifRefreshToken(data){
    const url = data.config.url
    return ApiCache.options.isRefreshToken&&ApiCache.options.tokenCode.includes(data?.response?.status || data?.status || data?.data?.status)&&!ApiCache.options.noRefreshUri.includes(url)
  }
  static refreshTokenFlow(data){
    if(!ApiCache.refreshList.length){
      ApiCache.refreshToken().then(
        async tokenStr => {
          ApiCache.clearMap('cacheMap')
          await ApiCache.refreshList.forEach(cb => cb(tokenStr))
          ApiCache.refreshList=[]
        },
        () => {
          ApiCache.clearMap('cacheMap')
          ApiCache.refreshList=[]
        }
      )
    }
    return new Promise((resolve)=>{
      ApiCache.refreshList.push((token)=>{
        data.config.headers[ApiCache.options.headerTokenKey] = token
        resolve(ApiCache.$axios(data.config))
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
        ApiCache.cancelMapFlow(config)
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
        if(!ApiCache.isCacheApi(response.config)){
          // 没有缓存或缓存过期
          // 设置该请求缓存过期时间
          response.cacheTimeout = new Date().getTime() + (response.config?.cacheTimeout ? response.config?.cacheTimeout : ApiCache.options.cacheTimeout)
          ApiCache.setCacheMap(response.config, response)
        }
        if(ApiCache.isCancelMapApi(response.config)){ // 删除该请求在cancelMap的数据
          ApiCache.deleteCancelMapApi(response.config)
        }
        // token刷新
        if(ApiCache.ifRefreshToken(response)){
          return ApiCache.refreshTokenFlow(response)
        }
        if(successCallback){
          ApiCache.interceptorsResponseSuccessCallback = successCallback
          return successCallback(response)
        }
        return Promise.resolve(data)
      },
      error => {
        // token刷新
        if(ApiCache.ifRefreshToken(error)){
          return ApiCache.refreshTokenFlow(error)
        }
        if(errCallback) {
          ApiCache.interceptorsResponseErrorCallback = errCallback
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
      if(ApiCache.isCacheApi(config)){
        // 有缓存
        const cacheApiData = ApiCache.getMap('cacheMap', ApiCache.createMapKey(config))
        if(cacheApiData.status === 200){
          if(ApiCache.interceptorsResponseSuccessCallback){
            resolve(ApiCache.interceptorsResponseSuccessCallback(cacheApiData))
            return
          }
          resolve(cacheApiData)
        }else{
          if(ApiCache.interceptorsResponseErrorCallback){
            resolve(ApiCache.interceptorsResponseErrorCallback(cacheApiData))
            return
          }
          reject(cacheApiData)
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
      if(ApiCache.isCacheApi(config)){
        // 有缓存
        const cacheApiData = ApiCache.getMap('cacheMap', ApiCache.createMapKey(config))
        if(cacheApiData.status === 200){
          if(ApiCache.interceptorsResponseSuccessCallback){
            resolve(ApiCache.interceptorsResponseSuccessCallback(cacheApiData))
            return
          }
          resolve(cacheApiData)
        }else{
          if(ApiCache.interceptorsResponseErrorCallback){
            resolve(ApiCache.interceptorsResponseErrorCallback(cacheApiData))
            return
          }
          reject(cacheApiData)
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
