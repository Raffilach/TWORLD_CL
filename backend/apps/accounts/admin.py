from django.contrib import admin

from .models import InviteCode, InviteRedemption


class InviteRedemptionInline(admin.TabularInline):
    model = InviteRedemption
    extra = 0
    readonly_fields = ["user", "redeemed_at"]
    can_delete = False


@admin.register(InviteCode)
class InviteCodeAdmin(admin.ModelAdmin):
    list_display = ["code", "note", "used_count", "max_uses", "is_active", "expires_at", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["code", "note"]
    readonly_fields = ["used_count", "created_at", "updated_at"]
    inlines = [InviteRedemptionInline]

    def save_model(self, request, obj, form, change):
        if not obj.code:
            obj.code = InviteCode.generate_code()
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
