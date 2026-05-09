FROM python:3.12-slim

WORKDIR /app

COPY web/requirements.txt /app/web/requirements.txt
RUN pip install --no-cache-dir -r web/requirements.txt

COPY . /app

CMD ["uvicorn", "web.main:app", "--host", "0.0.0.0", "--port", "8090"]
