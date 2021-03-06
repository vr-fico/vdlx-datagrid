/*
   Xpress Insight vdlx-datagrid
   =============================

   file vdlx-datagrid/ko-utils.js
   ```````````````````````
   vdlx-datagrid knockout utils.

    (c) Copyright 2019 Fair Isaac Corporation

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
 */

import { _ } from '../globals';

export const onSubscribe = _.curry(function (f, observable) {
    var subscribe = observable.subscribe;
    observable.subscribe = function () {
        var subscription = subscribe.apply(observable, arguments);
        f(subscription);
        return subscription;
    };

    return observable;
}, 2);

export function onSubscriptionDispose (f, subscription) {
    var dispose = subscription.dispose;

    subscription.dispose = function () {
        dispose.apply(subscription, arguments);
        f();
    };

    return subscription;
}

export const withEqualityComparer = _.curry(function (f, obs) {
    obs.equalityComparer = f;
    return obs;
}, 2);

/**
 * Sets equalityComparer on the observable
 */

export const withDeepEquals = withEqualityComparer(_.isEqual);