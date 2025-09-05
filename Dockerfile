FROM apify/actor-node-playwright-chrome:latest

COPY . ./

RUN npm ci --only=production

CMD ["node", "src/main.js"]
