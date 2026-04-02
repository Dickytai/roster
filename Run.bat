@echo off
echo Installing required envirment(will skip if already installed)...
pip install requests beautifulsoup4 openpyxl xlwings

echo.
echo Auto roster generator...
python Donotedit.py

echo.
echo done!
pause