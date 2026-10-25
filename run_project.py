import os
import subprocess
import sys
import time
import webbrowser
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, 'backend')
FRONTEND_DIR = os.path.join(ROOT, 'frontend')
BACKEND_ENV = os.path.join(BACKEND_DIR, '.env')
BACKEND_ENV_EXAMPLE = os.path.join(BACKEND_DIR, '.env.example')
WAITING_MODEL_DIR = os.path.join(BACKEND_DIR, 'ml')
WAITING_MODEL_ARTIFACT = os.path.join(
    WAITING_MODEL_DIR, 'artifacts', 'wait_model.joblib'
)
LOCAL_WAITING_MODEL_URL = 'http://127.0.0.1:8100'


def read_backend_environment():
    values = {}
    if not os.path.exists(BACKEND_ENV):
        return values
    with open(BACKEND_ENV, encoding='utf-8') as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def backend_environment_is_ready():
    if not os.path.exists(BACKEND_ENV):
        return False

    values = read_backend_environment()
    mongo_uri = values.get('MONGODB_URI') or values.get('MONGO_URI')
    if not mongo_uri:
        return False
    if (
        values.get('MONGODB_URI')
        and values.get('MONGO_URI')
        and values['MONGODB_URI'] != values['MONGO_URI']
    ):
        return False

    required = ('JWT_SECRET', 'FRONTEND_URL')
    if any(not values.get(key) for key in required):
        return False
    secret = values['JWT_SECRET']
    if len(secret) < 32 or any(
        marker in secret.lower()
        for marker in ('your_jwt_secret', 'change-this', 'replace-with')
    ):
        return False
    return True


def get_npm_executable():
    npm_executable = shutil.which('npm') or shutil.which('npm.cmd')
    if not npm_executable:
        return None
    try:
        subprocess.check_output([npm_executable, '--version'], stderr=subprocess.STDOUT)
        return npm_executable
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def maybe_copy_env():
    if not os.path.exists(BACKEND_ENV) and os.path.exists(BACKEND_ENV_EXAMPLE):
        print('Copying backend .env.example to .env...')
        shutil.copyfile(BACKEND_ENV_EXAMPLE, BACKEND_ENV)
        print('Created backend/.env from .env.example.')
        return False
    return backend_environment_is_ready()


def install_dependencies(path, npm_executable):
    node_modules = os.path.join(path, 'node_modules')
    if not os.path.exists(node_modules):
        print(f'Installing dependencies in {path}...')
        lockfile = os.path.join(path, 'package-lock.json')
        command = 'ci' if os.path.exists(lockfile) else 'install'
        subprocess.check_call([npm_executable, command], cwd=path)
    else:
        print(f'Dependencies already installed in {path}.')


def start_terminal(command, title, cwd, env=None):
    if os.name == 'nt':
        cmd = ['cmd', '/c', 'start', title, 'cmd', '/k', command]
        subprocess.Popen(cmd, cwd=cwd, env=env)
    else:
        print(f'Unable to open a new terminal window on this OS. Run manually: {command}')


def main():
    npm_executable = get_npm_executable()

    if not os.path.isdir(BACKEND_DIR) or not os.path.isdir(FRONTEND_DIR):
        print('ERROR: backend or frontend folders are missing. Make sure this script is placed in the project root.')
        sys.exit(1)

    if not npm_executable:
        print('ERROR: npm is not installed or not on PATH. Install Node.js and npm.')
        sys.exit(1)

    if not maybe_copy_env():
        print('ERROR: backend/.env is missing required settings or still uses the example JWT secret.')
        print('Configure MONGODB_URI (or MONGO_URI), a unique JWT_SECRET of at least 32 characters, and FRONTEND_URL, then launch again.')
        sys.exit(1)

    install_dependencies(BACKEND_DIR, npm_executable)
    install_dependencies(FRONTEND_DIR, npm_executable)

    backend_environment = os.environ.copy()
    configured_model_url = (
        backend_environment.get('WAITING_MODEL_URL')
        or read_backend_environment().get('WAITING_MODEL_URL')
        or ''
    ).strip()
    model_artifact_exists = os.path.isfile(WAITING_MODEL_ARTIFACT)

    if configured_model_url:
        backend_environment['WAITING_MODEL_URL'] = configured_model_url

    if (
        configured_model_url
        and configured_model_url.rstrip('/') != LOCAL_WAITING_MODEL_URL
    ):
        print(f'Using configured waiting-time model service: {configured_model_url}')
    elif model_artifact_exists:
        backend_environment['WAITING_MODEL_URL'] = LOCAL_WAITING_MODEL_URL
        model_command = f'"{sys.executable}" app.py'
        print('Starting the local waiting-time model service...')
        start_terminal(
            model_command,
            'AI Smart Hospital Model',
            WAITING_MODEL_DIR,
            env=backend_environment,
        )
        time.sleep(1)
    else:
        print(
            'Waiting-time model service not started: no evaluated model artifact '
            'was found. Predictions require sufficient approved observations; '
            'no synthetic estimates will be shown.'
        )

    start_terminal(
        'npm run dev',
        'AI Smart Hospital Backend',
        BACKEND_DIR,
        env=backend_environment,
    )
    time.sleep(1)
    start_terminal('npm run dev', 'AI Smart Hospital Frontend', FRONTEND_DIR)
    print('Waiting for frontend to start...')
    time.sleep(8)
    print('Opening browser at http://localhost:3000')
    webbrowser.open_new_tab('http://localhost:3000')
    print('Done. If the app does not load, verify both terminals are running.')


if __name__ == '__main__':
    main()
