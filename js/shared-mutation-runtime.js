"use strict";
const RUNTIME_KEY = '__FSFIT_SHARED_MUTATION_RUNTIME__';
function installSharedMutationRuntime() {
    const runtimeScope = globalThis;
    if (runtimeScope[RUNTIME_KEY] || typeof MutationObserver !== 'function')
        return;
    const NativeMutationObserver = globalThis.MutationObserver;
    const subscriptions = new Set();
    let sharedObserver = null;
    let sharedTarget = null;
    let pendingRecords = [];
    let deliveryFrame = 0;
    const matchesOptions = (record, options) => {
        if (record.type === 'childList')
            return options.childList === true;
        if (record.type === 'characterData')
            return options.characterData === true;
        if (record.type !== 'attributes' || options.attributes !== true)
            return false;
        if (!Array.isArray(options.attributeFilter) || options.attributeFilter.length === 0)
            return true;
        return record.attributeName !== null && options.attributeFilter.includes(record.attributeName);
    };
    const deliver = () => {
        deliveryFrame = 0;
        const records = pendingRecords;
        pendingRecords = [];
        if (!records.length)
            return;
        subscriptions.forEach(subscription => {
            if (!subscription.active)
                return;
            const filtered = records.filter(record => matchesOptions(record, subscription.options));
            if (!filtered.length)
                return;
            try {
                subscription.callback(filtered, subscription.facade);
            }
            catch (error) {
                window.setTimeout(() => { throw error; }, 0);
            }
        });
    };
    const queueDelivery = (records) => {
        pendingRecords.push(...records);
        if (deliveryFrame)
            return;
        deliveryFrame = window.requestAnimationFrame(deliver);
    };
    const ensureSharedObserver = (target) => {
        if (sharedObserver && sharedTarget === target)
            return;
        sharedObserver?.disconnect();
        sharedTarget = target;
        sharedObserver = new NativeMutationObserver(queueDelivery);
        sharedObserver.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
        });
    };
    const releaseSharedObserverIfIdle = () => {
        if (subscriptions.size > 0)
            return;
        sharedObserver?.disconnect();
        sharedObserver = null;
        sharedTarget = null;
        pendingRecords = [];
        if (deliveryFrame)
            window.cancelAnimationFrame(deliveryFrame);
        deliveryFrame = 0;
    };
    class SharedMutationObserver {
        callback;
        nativeObserver = null;
        sharedSubscription = null;
        constructor(callback) {
            if (typeof callback !== 'function')
                throw new TypeError('MutationObserver callback must be a function.');
            this.callback = callback;
        }
        observe(target, options = {}) {
            const canShare = target === document.body
                && options.subtree === true
                && options.attributeOldValue !== true
                && options.characterDataOldValue !== true;
            if (!canShare) {
                if (!this.nativeObserver)
                    this.nativeObserver = new NativeMutationObserver(this.callback);
                this.nativeObserver.observe(target, options);
                return;
            }
            if (this.sharedSubscription) {
                this.sharedSubscription.active = false;
                subscriptions.delete(this.sharedSubscription);
            }
            this.sharedSubscription = {
                callback: this.callback,
                facade: this,
                options: { ...options },
                active: true
            };
            subscriptions.add(this.sharedSubscription);
            ensureSharedObserver(target);
        }
        disconnect() {
            this.nativeObserver?.disconnect();
            if (this.sharedSubscription) {
                this.sharedSubscription.active = false;
                subscriptions.delete(this.sharedSubscription);
                this.sharedSubscription = null;
            }
            releaseSharedObserverIfIdle();
        }
        takeRecords() {
            return this.nativeObserver?.takeRecords() || [];
        }
    }
    globalThis.MutationObserver = SharedMutationObserver;
    runtimeScope[RUNTIME_KEY] = {
        native: NativeMutationObserver,
        subscriptions,
        disconnect() {
            sharedObserver?.disconnect();
            sharedObserver = null;
            sharedTarget = null;
            pendingRecords = [];
            subscriptions.forEach(subscription => { subscription.active = false; });
            subscriptions.clear();
            if (deliveryFrame)
                window.cancelAnimationFrame(deliveryFrame);
            deliveryFrame = 0;
        }
    };
    window.addEventListener('pagehide', event => {
        if (!event.persisted)
            runtimeScope[RUNTIME_KEY]?.disconnect();
    }, { once: true });
}
installSharedMutationRuntime();
