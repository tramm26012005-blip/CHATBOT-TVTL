FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./backend/app
COPY backend/admin ./backend/admin
COPY backend/expert ./backend/expert
COPY backend/student ./backend/student
COPY backend/manage.py ./backend/manage.py
COPY backend/scripts ./backend/scripts
COPY data ./data
RUN useradd --create-home appuser && chown -R appuser:appuser /srv
USER appuser
WORKDIR /srv/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
