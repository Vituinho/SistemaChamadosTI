from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .catalog import CATEGORIES, DEPARTMENTS, SYSTEMS

Status = Literal["NOVO", "EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO", "RESOLVIDO", "CANCELADO"]
Priority = Literal["BAIXA", "NORMAL", "ALTA", "URGENTE"]


class CleanModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class TicketCreate(CleanModel):
    name: str = Field(min_length=2, max_length=120)
    department: str = Field(max_length=80)
    location: str = Field(default="", max_length=160)
    category: str = Field(max_length=80)
    affected_system: str = Field(default="", max_length=80)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=5000)

    @field_validator("description", mode="before")
    @classmethod
    def optional_description(cls, value):
        return "" if value is None else value

    @field_validator("department")
    @classmethod
    def department_valid(cls, value):
        if value not in DEPARTMENTS:
            raise ValueError("Setor inválido")
        return value

    @field_validator("category")
    @classmethod
    def category_valid(cls, value):
        if value not in CATEGORIES:
            raise ValueError("Categoria inválida")
        return value

    @field_validator("affected_system")
    @classmethod
    def system_valid(cls, value):
        if value and value not in SYSTEMS:
            raise ValueError("Sistema inválido")
        return value

    @model_validator(mode="after")
    def system_required_for_software(self):
        if self.category == "Sistema" and not self.affected_system:
            raise ValueError("Informe o sistema afetado")
        return self


class TicketUpdate(CleanModel):
    status: Status | None = None
    priority: Priority | None = None


class Resolution(CleanModel):
    solution: str = Field(min_length=3, max_length=3000)


class Login(CleanModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)

    # Preserve spaces in passwords; only names and ticket text are trimmed.
    model_config = ConfigDict(extra="forbid")


class PushKeys(CleanModel):
    p256dh: str = Field(min_length=40, max_length=256)
    auth: str = Field(min_length=8, max_length=128)


class PushSubscriptionData(CleanModel):
    endpoint: str = Field(min_length=20, max_length=2048, pattern=r"^https://")
    keys: PushKeys


class PushEndpoint(CleanModel):
    endpoint: str = Field(min_length=20, max_length=2048, pattern=r"^https://")
