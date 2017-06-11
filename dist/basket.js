/*!
* basket.js
* v0.5.2 - 2017-06-08
* http://addyosmani.github.com/basket.js
* (c) Addy Osmani;  License
* Created by: Addy Osmani, Sindre Sorhus, Andrée Hansson, Mat Scales
* Contributors: Ironsjp, Mathias Bynens, Rick Waldron, Felipe Morais
*//*!
* basket.js
* v0.5.2 - 2017-06-08
* http://addyosmani.github.com/basket.js
* (c) Addy Osmani;  License
* Created by: Addy Osmani, Sindre Sorhus, Andrée Hansson, Mat Scales
* Contributors: Ironsjp, Mathias Bynens, Rick Waldron, Felipe Morais
*/(function (window, document) {
    'use strict';

    var head = document.head || document.getElementsByTagName('head')[0];
    var storagePrefix = 'BB-';
    var defaultExpiration = 5000;
    var inBasket = [];

    function MyPromise (fn) {
        this.status = 'pending';
        this.resolveFunc = function () {};
        this.rejectFunc = function () {};
        fn(this.resolve.bind(this), this.reject.bind(this));
    }

    MyPromise.prototype.resolve = function (val) {
        var self = this;
        if (this.status === 'pending') {
            this.status = 'resolved';
            this.value = val;
            setTimeout(function () {
                self.resolveFunc(self.value);
            }, 0);
        }
    };

    MyPromise.prototype.reject = function (val) {
        var self = this;
        if (this.status === 'pending') {
            this.status = 'rejected';
            this.value = val;
            setTimeout(function () {
                self.rejectFunc(self.value);
            }, 0);
        }
    };

    MyPromise.prototype.then = function (resolveFunc, rejectFunc) {
        var self = this;
        return new MyPromise(function (resolveNext, rejectNext) {
            function resolveFuncWrap () {
                var result = resolveFunc(self.value);
                if (result && typeof result.then === 'function') {
                    // 如果result是MyPromise对象，则通过then将resolveNext和rejectNext传给它
                    result.then(resolveNext, rejectNext);
                } else {
                    // 如果result是其他对象，则作为参数传给resolveNext
                    resolveNext(result);
                }
            }

            function rejectFuncWrap () {
                var result = rejectFunc(self.value);
                if (result && typeof result.then === 'function') {
                    // 如果result是MyPromise对象，则通过then将resolveNext和rejectNext传给它
                    result.then(resolveNext, rejectNext);
                } else {
                    // 如果result是其他对象，则作为参数传给resolveNext
                    resolveNext(result);
                }
            }
            self.resolveFunc = resolveFuncWrap;
            self.rejectFunc = rejectFuncWrap;
        });
    };

    MyPromise.all = function (promises) {
        if (!Array.isArray(promises)) {
            throw new TypeError('You must pass an array to all.');
        }
        // 返回一个promise 实例
        return new MyPromise(function (resolve, reject) {
            var i = 0,
                result = [],
                len = promises.length,
                count = len;

            // 每一个 promise 执行成功后，就会调用一次 resolve 函数
            function resolver (index) {
                return function (value) {
                    resolveAll(index, value);
                };
            }

            function rejecter (reason) {
                reject(reason);
            }
            // 存储每一个promise的参数
            function resolveAll (index, value) {
                // 等于0 表明所有的promise 都已经运行完成，执行resolve函数
                result[index] = value;
                if (--count === 0) {
                    resolve(result);
                }
            }
            // 依次循环执行每个promise
            // 若有一个失败，就执行rejecter函数
            for (; i < len; i++) {
                promises[i].then(resolver(i), rejecter);
            }
        });
    };

    var addLocalStorage = function (key, storeObj) {
        try {
            localStorage.setItem(storagePrefix + key, JSON.stringify(storeObj));
            return true;
        } catch (e) {
            if (e.name.toUpperCase().indexOf('QUOTA') >= 0) {
                var item;
                var tempScripts = [];

                for (item in localStorage) {
                    if (item.indexOf(storagePrefix) === 0) {
                        tempScripts.push(JSON.parse(localStorage[item]));
                    }
                }

                if (tempScripts.length) {
                    tempScripts.sort(function (a, b) {
                        return a.stamp - b.stamp;
                    });

                    basket.remove(tempScripts[0].key);

                    return addLocalStorage(key, storeObj);
                } else {
                    // no files to remove. Larger than available quota
                    return;
                }
            } else {
                // some other error
                return;
            }
        }
    };

    var getUrl = function (url) {
        var promise = new MyPromise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if ((xhr.status === 200) ||
                        ((xhr.status === 0) && xhr.responseText)) {
                        resolve({
                            content: xhr.responseText,
                            type: xhr.getResponseHeader('content-type')
                        });
                    } else {
                        reject(new Error(xhr.statusText));
                    }
                }
            };

            // By default XHRs never timeout, and even Chrome doesn't implement the
            // spec for xhr.timeout. So we do it ourselves.
            setTimeout(function () {
                if (xhr.readyState < 4) {
                    xhr.abort();
                }
            }, basket.timeout);

            xhr.send();
        });

        return promise;
    };

    var saveUrl = function (obj) {
        return getUrl(obj.url).then(function (result) {
            var storeObj = wrapStoreData(obj, result);

            if (!obj.skipCache) {
                addLocalStorage(obj.key, storeObj);
            }

            return storeObj;
        });
    };

    var wrapStoreData = function (obj, data) {
        var now = +new Date();
        obj.data = data.content;
        obj.originalType = data.type;
        obj.type = obj.type || data.type;
        obj.skipCache = obj.skipCache || false;
        obj.stamp = now;
        obj.expire = now + ((obj.expire || defaultExpiration) * 60 * 60 * 1000);

        return obj;
    };

    var isCacheValid = function (source, obj) {
        return !source ||
            source.expire - +new Date() < 0 ||
            obj.unique !== source.unique ||
            (basket.isValidItem && !basket.isValidItem(source, obj));
    };

    var handleStackObject = function (obj) {
        var source, promise, shouldFetch;

        if (!obj.url) {
            return;
        }

        obj.key = (obj.key || obj.url);
        source = basket.get(obj.key);

        obj.execute = obj.execute !== false;

        shouldFetch = isCacheValid(source, obj);

        if (obj.live || shouldFetch) {
            if (obj.unique) {
                // set parameter to prevent browser cache
                obj.url += ((obj.url.indexOf('?') > 0) ? '&' : '?') + 'bb-unique=' + obj.unique;
            }
            promise = saveUrl(obj);

            if (obj.live && !shouldFetch) {
                promise = promise
                    .then(function (result) {
                        // If we succeed, just return the value
                        return result;
                    }, function () {
                        return source;
                    });
            }
        } else {
            source.type = obj.type || source.originalType;
            source.execute = obj.execute;
            promise = new MyPromise(function (resolve) {
                resolve(source);
            });
        }

        return promise;
    };

    var injectScript = function (obj) {
        var script = document.createElement('script');
        script.defer = true;
        // Have to use .text, since we support IE8,
        // which won't allow appending to a script
        script.text = obj.data;
        head.appendChild(script);
    };

    var handlers = {
        'default': injectScript
    };

    var execute = function (obj) {
        if (obj.type && handlers[obj.type]) {
            return handlers[obj.type](obj);
        }

        return handlers['default'](obj); // 'default' is a reserved word
    };

    var performActions = function (resources) {
        return resources.map(function (obj) {
            if (obj.execute) {
                execute(obj);
            }

            return obj;
        });
    };

    var fetch = function () {
        var i, l, promises = [];

        for (i = 0, l = arguments.length; i < l; i++) {
            promises.push(handleStackObject(arguments[i]));
        }

        return MyPromise.all(promises);
    };

    // var thenRequire = function () {
    //     var resources = fetch.apply(null, arguments);
    //     var promise = this.then(function () {
    //         return resources;
    //     }).then(performActions);
    //     promise.thenRequire = thenRequire;
    //     return promise;
    // };

    window.basket = {
        require: function () {
            for (var a = 0, l = arguments.length; a < l; a++) {
                arguments[a].execute = arguments[a].execute !== false;

                if (arguments[a].once && inBasket.indexOf(arguments[a].url) >= 0) {
                    arguments[a].execute = false;
                } else if (arguments[a].execute !== false && inBasket.indexOf(arguments[a].url) < 0) {
                    inBasket.push(arguments[a].url);
                }
            }

            var promise = fetch.apply(null, arguments).then(performActions);

            // promise.thenRequire = thenRequire;
            return promise;
        },

        remove: function (key) {
            localStorage.removeItem(storagePrefix + key);
            return this;
        },

        get: function (key) {
            var item = localStorage.getItem(storagePrefix + key);
            try {
                return JSON.parse(item || 'false');
            } catch (e) {
                return false;
            }
        },

        clear: function (expired) {
            var item, key;
            var now = +new Date();

            for (item in localStorage) {
                key = item.split(storagePrefix)[1];
                if (key && (!expired || this.get(key).expire <= now)) {
                    this.remove(key);
                }
            }

            return this;
        },

        isValidItem: null,

        timeout: 5000,

        addHandler: function (types, handler) {
            if (!Array.isArray(types)) {
                types = [types];
            }
            types.forEach(function (type) {
                handlers[type] = handler;
            });
        },

        removeHandler: function (types) {
            basket.addHandler(types, undefined);
        }
    };

    // delete expired keys
    basket.clear(true);

})(this, document);