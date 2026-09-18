from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500


class LargePagination(DefaultPagination):
    page_size = 200
    max_page_size = 2000
