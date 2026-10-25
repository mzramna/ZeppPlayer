/**
 * Zepp OS Sensor Reactive State Store
 * Manages health/sensor telemetry with reactive listeners for @zos/sensor and hmSensor
 */

export const INITIAL_SENSOR_DEFAULTS = {
  steps: 4500,
  stepTarget: 9000,
  heartRate: {
    current: 75,
    resting: 62,
    last: 75,
    today: [60, 68, 75, 72, 80, 75]
  },
  calories: {
    burned: 320,
    target: 500,
    current: 320
  },
  sleep: {
    totalMinutes: 460,
    score: 85,
    deep: 110,
    light: 290,
    rem: 60,
    wake: 0
  },
  spo2: 98,
  stress: 35,
  bodyTemp: 36.6,
  distance: 3.2,
  pai: {
    total: 78,
    daily: 12,
    current: 78
  },
  stand: {
    current: 8,
    target: 12
  },
  fatBurning: {
    current: 25,
    target: 30
  },
  battery: {
    level: 82,
    charging: false
  },
  bleConnected: true
};

export class SensorState {
  constructor(initialData = {}) {
    this.listeners = new Map(); // event -> Set of callbacks
    this.sensorInstances = new Map(); // sensorType -> Set of sensor instances
    this._data = JSON.parse(JSON.stringify(INITIAL_SENSOR_DEFAULTS));
    if (initialData && typeof initialData === 'object') {
      this.update(initialData, false);
    }
  }

  get(key) {
    switch (key) {
      case 'steps':
        return this._data.steps;
      case 'stepTarget':
        return this._data.stepTarget;
      case 'heartRate':
      case 'heart_rate':
      case 'hr':
        return this._data.heartRate;
      case 'heartRateCurrent':
      case 'hrCurrent':
        return this._data.heartRate.current;
      case 'heartRateResting':
      case 'restingHeartRate':
        return this._data.heartRate.resting;
      case 'calories':
      case 'calorie':
        return this._data.calories.burned;
      case 'caloriesBurned':
        return this._data.calories.burned;
      case 'caloriesTarget':
        return this._data.calories.target;
      case 'sleep':
        return this._data.sleep;
      case 'spo2':
        return this._data.spo2;
      case 'stress':
        return this._data.stress;
      case 'bodyTemp':
      case 'body_temp':
        return this._data.bodyTemp;
      case 'distance':
        return this._data.distance;
      case 'pai':
        return typeof this._data.pai === 'object' ? this._data.pai.total : this._data.pai;
      case 'stand':
        return typeof this._data.stand === 'object' ? this._data.stand.current : this._data.stand;
      case 'fatBurning':
      case 'fat_burning':
        return typeof this._data.fatBurning === 'object' ? this._data.fatBurning.current : this._data.fatBurning;
      case 'battery':
        return typeof this._data.battery === 'object' ? this._data.battery.level : this._data.battery;
      case 'charging':
        return typeof this._data.battery === 'object' ? this._data.battery.charging : false;
      case 'bleConnected':
      case 'ble_connected':
        return this._data.bleConnected;
      default:
        return this._data[key];
    }
  }

  set(keyOrObject, val) {
    if (typeof keyOrObject === 'object' && keyOrObject !== null) {
      return this.update(keyOrObject);
    }
    const key = keyOrObject;
    const changedSensors = new Set();

    switch (key) {
      case 'steps':
        this._data.steps = Number(val);
        changedSensors.add('step');
        changedSensors.add('steps');
        break;
      case 'stepTarget':
        this._data.stepTarget = Number(val);
        changedSensors.add('step');
        break;
      case 'heartRate':
      case 'heart_rate':
      case 'hr':
        if (typeof val === 'number') {
          this._data.heartRate.current = val;
          this._data.heartRate.last = val;
        } else if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.heartRate, val);
        }
        changedSensors.add('heartRate');
        changedSensors.add('heart_rate');
        break;
      case 'restingHeartRate':
        this._data.heartRate.resting = Number(val);
        changedSensors.add('heartRate');
        break;
      case 'calories':
      case 'calorie':
        if (typeof val === 'number') {
          this._data.calories.burned = val;
          this._data.calories.current = val;
        } else if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.calories, val);
        }
        changedSensors.add('calorie');
        changedSensors.add('calories');
        break;
      case 'sleep':
        if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.sleep, val);
        }
        changedSensors.add('sleep');
        break;
      case 'spo2':
        this._data.spo2 = Number(val);
        changedSensors.add('spo2');
        break;
      case 'stress':
        this._data.stress = Number(val);
        changedSensors.add('stress');
        break;
      case 'bodyTemp':
      case 'body_temp':
        this._data.bodyTemp = Number(val);
        changedSensors.add('bodyTemp');
        break;
      case 'distance':
        this._data.distance = Number(val);
        changedSensors.add('distance');
        break;
      case 'pai':
        if (typeof val === 'number') {
          this._data.pai.total = val;
          this._data.pai.current = val;
        } else if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.pai, val);
        }
        changedSensors.add('pai');
        break;
      case 'stand':
        if (typeof val === 'number') {
          this._data.stand.current = val;
        } else if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.stand, val);
        }
        changedSensors.add('stand');
        break;
      case 'fatBurning':
      case 'fat_burning':
        if (typeof val === 'number') {
          this._data.fatBurning.current = val;
        } else if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.fatBurning, val);
        }
        changedSensors.add('fatBurning');
        break;
      case 'battery':
        if (typeof val === 'number') {
          this._data.battery.level = val;
        } else if (typeof val === 'object' && val !== null) {
          Object.assign(this._data.battery, val);
        }
        changedSensors.add('battery');
        break;
      case 'charging':
        this._data.battery.charging = Boolean(val);
        changedSensors.add('battery');
        break;
      case 'bleConnected':
      case 'ble_connected':
        this._data.bleConnected = Boolean(val);
        changedSensors.add('ble');
        changedSensors.add('bleConnected');
        break;
      default:
        this._data[key] = val;
        changedSensors.add(key);
        break;
    }

    this._emitChange(key, val, changedSensors);
    return this;
  }

  update(patch, notifyListeners = true) {
    if (!patch || typeof patch !== 'object') return this;
    const changedSensors = new Set();

    for (const [k, v] of Object.entries(patch)) {
      if (k === 'steps') {
        this._data.steps = Number(v);
        changedSensors.add('step');
        changedSensors.add('steps');
      } else if (k === 'stepTarget') {
        this._data.stepTarget = Number(v);
        changedSensors.add('step');
      } else if (k === 'heartRate' || k === 'heart_rate' || k === 'hr') {
        if (typeof v === 'number') {
          this._data.heartRate.current = v;
          this._data.heartRate.last = v;
        } else if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.heartRate, v);
        }
        changedSensors.add('heartRate');
      } else if (k === 'calories' || k === 'calorie') {
        if (typeof v === 'number') {
          this._data.calories.burned = v;
          this._data.calories.current = v;
        } else if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.calories, v);
        }
        changedSensors.add('calorie');
      } else if (k === 'sleep') {
        if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.sleep, v);
        }
        changedSensors.add('sleep');
      } else if (k === 'spo2') {
        this._data.spo2 = Number(v);
        changedSensors.add('spo2');
      } else if (k === 'stress') {
        this._data.stress = Number(v);
        changedSensors.add('stress');
      } else if (k === 'bodyTemp' || k === 'body_temp') {
        this._data.bodyTemp = Number(v);
        changedSensors.add('bodyTemp');
      } else if (k === 'distance') {
        this._data.distance = Number(v);
        changedSensors.add('distance');
      } else if (k === 'pai') {
        if (typeof v === 'number') {
          this._data.pai.total = v;
          this._data.pai.current = v;
        } else if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.pai, v);
        }
        changedSensors.add('pai');
      } else if (k === 'stand') {
        if (typeof v === 'number') {
          this._data.stand.current = v;
        } else if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.stand, v);
        }
        changedSensors.add('stand');
      } else if (k === 'fatBurning' || k === 'fat_burning') {
        if (typeof v === 'number') {
          this._data.fatBurning.current = v;
        } else if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.fatBurning, v);
        }
        changedSensors.add('fatBurning');
      } else if (k === 'battery') {
        if (typeof v === 'number') {
          this._data.battery.level = v;
        } else if (typeof v === 'object' && v !== null) {
          Object.assign(this._data.battery, v);
        }
        changedSensors.add('battery');
      } else if (k === 'charging') {
        this._data.battery.charging = Boolean(v);
        changedSensors.add('battery');
      } else if (k === 'bleConnected') {
        this._data.bleConnected = Boolean(v);
        changedSensors.add('ble');
      } else {
        this._data[k] = v;
        changedSensors.add(k);
      }
    }

    if (notifyListeners) {
      this._emitChange('*', patch, changedSensors);
    }
    return this;
  }

  getAll() {
    return JSON.parse(JSON.stringify(this._data));
  }

  reset() {
    this._data = JSON.parse(JSON.stringify(INITIAL_SENSOR_DEFAULTS));
    this._emitChange('*', this._data, new Set(['all']));
    return this;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  onChange(callback) {
    return this.on('change', callback);
  }

  registerSensorInstance(sensorType, instance) {
    const norm = String(sensorType).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!this.sensorInstances.has(norm)) {
      this.sensorInstances.set(norm, new Set());
    }
    this.sensorInstances.get(norm).add(instance);
    return () => this.unregisterSensorInstance(norm, instance);
  }

  unregisterSensorInstance(sensorType, instance) {
    const norm = String(sensorType).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (this.sensorInstances.has(norm)) {
      this.sensorInstances.get(norm).delete(instance);
    }
  }

  _emitChange(key, value, changedSensors) {
    // 1. Emit to general listeners
    const allListeners = this.listeners.get('change');
    if (allListeners) {
      for (const cb of allListeners) {
        try { cb({ key, value, state: this._data }); } catch (err) { console.error('sensorState change listener error:', err); }
      }
    }

    // 2. Emit to specific event listeners
    for (const s of changedSensors) {
      const specific = this.listeners.get(s);
      if (specific) {
        for (const cb of specific) {
          try { cb(value); } catch (err) { console.error(`sensorState ${s} listener error:`, err); }
        }
      }

      // 3. Trigger registered sensor instances
      const norm = s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const instances = this.sensorInstances.get(norm);
      if (instances) {
        for (const inst of instances) {
          try {
            if (typeof inst._triggerChange === 'function') {
              inst._triggerChange();
            } else if (typeof inst.trigger === 'function') {
              inst.trigger('change');
            } else if (Array.isArray(inst._callbacks)) {
              for (const cb of inst._callbacks) cb();
            }
          } catch (e) {
            console.error('Error triggering sensor instance:', e);
          }
        }
      }
    }
  }
}

export const sensorState = new SensorState();
export default sensorState;
