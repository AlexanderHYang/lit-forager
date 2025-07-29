This directory should contain your SSL/TLS certificate files for local development.

To generate self-signed certificates for local use, run from the `multimodal-llm` directory:
```
openssl req -nodes -new -x509 -keyout certificates/key.pem -out certificates/cert.pem -days 365
```

Do NOT commit your actual certificate files to version control.

For detailed setup instructions, please refer to the **Quick Start** section in the main project README.