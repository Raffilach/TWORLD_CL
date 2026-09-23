"""Хранилище загрузок со случайными именами файлов.

Фото прогресса, дневник и голосовые заметки — личные. В продакшне
/media/ отдаёт веб-сервер без проверки прав, поэтому ссылка на файл
должна быть неугадываемой: вместо «progress/IMG_1234.jpg» — 128 бит
случайности. Папка по типу загрузки сохраняется.
"""
import os
import uuid

from django.core.files.storage import FileSystemStorage


class RandomNameStorage(FileSystemStorage):
    def generate_filename(self, filename):
        directory, name = os.path.split(filename)
        extension = os.path.splitext(name)[1].lower()[:10]
        return super().generate_filename(os.path.join(directory, f"{uuid.uuid4().hex}{extension}"))
