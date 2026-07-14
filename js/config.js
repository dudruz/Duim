"use strict";

window.DuAmigoConfig = Object.freeze({
    business: Object.freeze({
        name: "Barbearia du Amigo",
        barberName: "Duin",
        shortName: "Du Amigo",
        address: "R. Santa Clara de Assis, nº 20 - Minaslândia, Belo Horizonte - MG, 31810-340",
        phoneDisplay: "",
        phoneDigits: "",
        openingHours: "",
        instagramUrl: "",
        mapUrl: "https://www.google.com/maps/search/?api=1&query=R.%20Santa%20Clara%20de%20Assis%2C%2020%20-%20Minasl%C3%A2ndia%2C%20Belo%20Horizonte%20-%20MG%2C%2031810-340"
    }),

    routes: Object.freeze({
        home: "index.html",
        booking: "pages/agendamento.html",
        store: "pages/loja.html",
        privacy: "pages/privacidade.html",
        adminLogin: "admin/login.html",
        adminDashboard: "admin/dashboard.html"
    }),

    features: Object.freeze({
        onlinePayments: false,
        onlineStore: false,
        customerArea: false
    }),

    backend: Object.freeze({
        missingMessage: "O sistema ainda não foi conectado ao Supabase. Preencha js/env.js para carregar os dados reais.",
        genericError: "Não foi possível carregar os dados agora. Tente novamente em instantes."
    })
});
