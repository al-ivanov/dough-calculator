# Тесто на Ubuntu

Калькулятор и сервер уведомлений работают на одном адресе. Система — Ubuntu 24.04: контейнер в Proxmox или Raspberry Pi. Ресурсов хватает скромных: 1 ядро, 512 МБ памяти, диск от 8 ГБ.

## Что видно из интернета

Страница выходит наружу через Keenetic и KeenDNS, отдельным именем четвёртого уровня, например `https://testo.имя-роутера.keenetic.pro`. Роутер сам принимает HTTPS и передаёт запрос только на порт этого приложения внутри дома. Сертификат хранится на Keenetic. В облачном режиме KeenDNS содержимое HTTPS между телефоном и роутером не читает, а SSH и остальные протоколы через это имя не проходят.

Из интернета не открываются ни вход на сервер, ни другие устройства сети, ни веб-интерфейс самого роутера — если не включать их отдельно. Кто знает адрес, может открыть калькулятор: на странице нет паролей и файлов домашней сети. Сервер принимает только время напоминания и хранит не больше 8 таких задач.

Этого достаточно, пока соблюдены три ограничения:

- не включать доступ из интернета к веб-интерфейсу Keenetic;
- не создавать проброс портов, особенно порта 22;
- в правиле KeenDNS указать только этот сервер и только порт 8787.

## 1. Поставить Ubuntu

Дальше с шага «Поставить Node.js» действия одинаковые. Сначала выберите, где будет система.

### Контейнер в Proxmox

Отдельная виртуальная машина не нужна. Хватит непривилегированного контейнера Ubuntu 24.04.

1. Datacenter → хранилище `local` → CT Templates → Templates.
2. Скачайте шаблон **Ubuntu 24.04 standard**.
3. Create CT:
   - hostname: `testo`
   - unprivileged container: включено
   - пароль или SSH-ключ
   - диск 8 ГБ на `local-lvm`
   - CPU: 1 ядро
   - память: 512 МБ, swap 512 МБ
   - сеть: Bridge `vmbr0`, IPv4 DHCP
   - DNS: как у остальных контейнеров
4. На вкладке Confirm включите Start after created и Finish.
5. В Options контейнера включите Start at boot.

Зайдите в консоль контейнера под root. В Keenetic зарегистрируйте контейнер и закрепите за ним постоянный адрес: «Мои сети и Wi-Fi» → клиент → «Постоянный IP».

### Raspberry Pi

Подойдёт Raspberry Pi 4 или Pi 5 и карта от 16 ГБ. Ставится та же Ubuntu Server 24.04, 64-битная.

1. Установите [Raspberry Pi Imager](https://www.raspberrypi.com/software/) на компьютер.
2. Выберите устройство: Raspberry Pi 4 или Pi 5.
3. Операционная система: Other general-purpose OS → Ubuntu → **Ubuntu Server 24.04 LTS (64-bit)**.
4. В настройках образа задайте hostname `testo`, имя пользователя и пароль, включите SSH. Если Pi будет по Wi-Fi, укажите сеть здесь же. Кабель в Keenetic проще и надёжнее.
5. Запишите образ на карту, вставьте её в Pi и включите питание. Первый запуск занимает несколько минут.
6. В Keenetic зарегистрируйте Pi и закрепите постоянный IP: «Мои сети и Wi-Fi» → клиент → «Постоянный IP».
7. С компьютера: `ssh ИМЯ@АДРЕС-PI`. При первом входе Ubuntu может попросить сменить пароль.

Дальше команды те же, что и для контейнера. На Pi их выполняет пользователь с `sudo`.

## 2. Поставить Node.js 22

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
node -v
```

В выводе `node -v` должна быть 22 или новее.

## 3. Положить файлы приложения

`АДРЕС` — постоянный IP, который Keenetic выдал серверу. Каталог `server/node_modules` копировать не нужно. Если он уже есть локально, перед копированием его можно удалить.

Из контейнера Proxmox, куда вы входите как root:

```bash
mkdir -p /opt/testo
```

На компьютере:

```bash
scp -r ~/Desktop/dough-calculator/. root@АДРЕС:/opt/testo/
```

С Raspberry Pi, куда вы входите под своим пользователем:

```bash
scp -r ~/Desktop/dough-calculator ИМЯ@АДРЕС:~/testo-src
ssh ИМЯ@АДРЕС
sudo mkdir -p /opt/testo
sudo cp -a ~/testo-src/. /opt/testo/
rm -rf ~/testo-src
```

На сервере:

```bash
sudo useradd --system --home /opt/testo --shell /usr/sbin/nologin testo
sudo mkdir -p /var/lib/testo
cd /opt/testo/server
sudo npm install --omit=dev
sudo chown -R testo:testo /opt/testo /var/lib/testo
```

Ключи уведомлений сервер создаст сам при первом запуске и положит в `/var/lib/testo`. Этот каталог не копируйте и никуда не выкладывайте: в нём секретный ключ.

## 4. Запустить сервис

Создайте `/etc/systemd/system/testo.service`:

```ini
[Unit]
Description=Testo dough calculator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=testo
Group=testo
WorkingDirectory=/opt/testo/server
Environment=PORT=8787
Environment=HOST=0.0.0.0
Environment=DATA_DIR=/var/lib/testo
Environment=VAPID_CONTACT=mailto:admin@example.com
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`VAPID_CONTACT` замените на свой email. Путь к node проверьте командой `command -v node`. Если он не `/usr/bin/node`, подставьте результат в `ExecStart`.

`HOST=0.0.0.0` нужен, чтобы Keenetic в домашней сети достучался до приложения. Снаружи этот порт закрывает файрвол из следующего шага.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now testo
sudo systemctl status testo
curl -fsS http://127.0.0.1:8787/api/vapid-public-key
```

Последняя команда должна напечатать JSON с полем `publicKey`.

## 5. Пускать к порту только домашнюю сеть

Подставьте свою подсеть. Её видно в Keenetic в разделе «Мои сети и Wi-Fi». Часто это `192.168.1.0/24`.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8787 proto tcp
sudo ufw enable
sudo ufw status
```

Порт 22 оставлен для входа с домашних компьютеров. Из интернета он не торчит, потому что на Keenetic для него нет правила.

## 6. Открыть сайт через KeenDNS

На роутере KeenDNS уже должен быть включён, с именем вроде `имя.keenetic.pro`. Зона может быть `keenetic.pro`, `keenetic.name` или `keenetic.link` — берите ту, которую показывает роутер. Режим «Через облако» подходит и с серым адресом провайдера. В прямом режиме дополнительные пробросы тоже не нужны.

1. «Сетевые правила» → «Доменное имя» → вкладка KeenDNS.
2. В блоке доступа к веб-приложениям домашней сети нажмите «Добавить».
3. Хост: сервер `testo`.
4. Доменное имя: `testo`. Полный адрес получится `testo.имя-роутера.keenetic.pro`.
5. Порт TCP: `8787`.
6. Доступ из интернета: без авторизации. Страница должна открываться сама, иначе iPhone не сможет подписаться на уведомление.
7. Сохраните. Доступ к веб-интерфейсу самого роутера из интернета не включайте.

Проверка с телефона, можно вне дома: откройте в Safari адрес, который показал Keenetic, с `https://` в начале. Должен загрузиться калькулятор, без предупреждения о сертификате.

## 7. Проверить уведомление на iPhone

Уведомление Web Push приходит только приложению, добавленному на экран «Домой», и только на iOS 16.4 или новее.

1. В Safari откройте `https://testo.имя-роутера.keenetic.pro`.
2. «Поделиться» → «На экран Домой» → «Добавить».
3. Откройте «Тесто» с экрана «Домой», не из вкладки Safari.
4. В блоке «Предварительная ферментация» выберите время и нажмите «Старт».
5. Разрешите уведомления.
6. Под таймером должно быть: «Уведомление придёт, когда время выйдет.»

На сервере в `/var/lib/testo/jobs.json` появится задача с полем `endsAt`.

Чтобы не ждать час, остановите сервис и поставьте срок на ближайшие секунды. `endsAt` — это миллисекунды Unix.

```bash
sudo systemctl stop testo
sudo python3 - <<'PY'
import json, time
path = "/var/lib/testo/jobs.json"
jobs = json.load(open(path))
jobs[0]["endsAt"] = int(time.time() * 1000) + 20_000
json.dump(jobs, open(path, "w"), ensure_ascii=False, indent=2)
print("notification in 20 seconds")
PY
sudo chown testo:testo /var/lib/testo/jobs.json
sudo systemctl start testo
```

Закройте приложение на телефоне. Примерно через полминуты должно прийти уведомление «Расстойка закончилась. Тесто можно убирать в холодильник.» Нажатие открывает «Тесто».

Секундомер ферментации на сервер не ходит. Над часами он показывает дни: `0 дней`, `1 день`, `2 дня`. Его можно проверить сразу: Старт, закрыть приложение, открыть снова. Время продолжит идти. Пауза его замораживает, сброс обнуляет.

Если в момент «Старт» телефон не достучался до сервера, отсчёт всё равно пойдёт, а под ним будет «Уведомление не запланировано.»

## Обновление

С компьютера снова скопируйте файлы в `/opt/testo`, не затирая `/var/lib/testo`. Затем на сервере:

```bash
cd /opt/testo/server
sudo -u testo npm install --omit=dev
sudo systemctl restart testo
```
