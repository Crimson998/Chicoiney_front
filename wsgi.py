import sys
import os

# Add your project directory to the sys.path
project_home = '/home/Crimson99898/backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# (Optional) Activate your virtualenv if not set in the web tab
activate_this = '/home/Crimson99898/backend/venv/bin/activate_this.py'
if os.path.exists(activate_this):
    with open(activate_this) as file_:
        exec(file_.read(), dict(__file__=activate_this))

# Import the FastAPI app object
from main import app as application 