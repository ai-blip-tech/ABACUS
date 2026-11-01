"""Independent wall-clock stop, started before importing Torch or loading weights."""
import os
import time
import requests


def stop_own_pod():
    pod_id = os.environ.get('RUNPOD_POD_ID')
    key = os.environ.get('RUNPOD_API_KEY')
    if not pod_id or not key:
        print('SELF_STOP_CREDENTIALS_UNAVAILABLE', flush=True)
        return False
    query = 'mutation { podStop(input:{podId:"' + pod_id + '"}) { id desiredStatus } }'
    for attempt in range(5):
        try:
            result = requests.post('https://api.runpod.io/graphql', params={'api_key': key}, json={'query': query}, timeout=10).json()
            data = (result.get('data') or {}) if isinstance(result, dict) else {}
            if (data.get('podStop') or {}).get('desiredStatus') == 'EXITED':
                return True
        except (requests.RequestException, ValueError):
            pass
        time.sleep(2)
    print('SELF_STOP_FAILED_COORDINATOR_MUST_RETRY', flush=True)
    return False


if __name__ == '__main__':
    # Fail closed if the deadline is missing, malformed, or already passed.
    try:
        delay = max(0, min(1800, int(os.environ['MODEL3D_DEADLINE_MS']) / 1000 - time.time()))
    except (KeyError, ValueError):
        delay = 0
    time.sleep(delay)
    stop_own_pod()
