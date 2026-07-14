"use strict";

(() => {
    const backend = window.DuAmigoBackend;
    const utils = window.DuAmigoUtils;

    const getClient = () => backend.getClient();

    const throwIfError = ({ data, error }) => {
        if (error) throw error;
        return data;
    };

    const localDateRange = (dateString) => {
        const start = new Date(`${dateString}T00:00:00`);
        const end = new Date(`${dateString}T23:59:59.999`);
        return { start: start.toISOString(), end: end.toISOString() };
    };

    const normalizePhone = (value = "") => utils?.normalizeBrazilPhone(value) || String(value).replace(/\D/g, "").slice(-11);

    const publicApi = {
        async getSettings() {
            const client = getClient();
            return throwIfError(await client
                .from("settings")
                .select("*")
                .limit(1)
                .maybeSingle());
        },

        async getServices({ featuredOnly = false } = {}) {
            const client = getClient();
            let query = client
                .from("services")
                .select("*")
                .eq("active", true)
                .order("position", { ascending: true })
                .order("name", { ascending: true });

            if (featuredOnly) query = query.eq("featured", true);
            return throwIfError(await query);
        },

        async getProducts({ featuredOnly = false } = {}) {
            const client = getClient();
            let query = client
                .from("products")
                .select("*")
                .eq("active", true)
                .neq("stock_status", "hidden")
                .order("position", { ascending: true })
                .order("name", { ascending: true });

            if (featuredOnly) query = query.eq("featured", true);
            return throwIfError(await query);
        },

        async getAvailableSlots(serviceId, date) {
            const client = getClient();
            return throwIfError(await client.rpc("get_available_slots", {
                p_service_id: serviceId,
                p_date: date
            }));
        },

        async createAppointment(payload) {
            const client = getClient();
            const data = throwIfError(await client.rpc("create_customer_appointment_v2", {
                p_service_id: payload.serviceId,
                p_starts_at: payload.startsAt,
                p_notes: payload.notes || null,
                p_billing_mode: payload.billingMode || "salon"
            }));
            return Array.isArray(data) ? data[0] : data;
        },

        async createCheckout(payload) {
            const client = getClient();
            const { data, error } = await client.functions.invoke("create-infinitepay-checkout", {
                body: payload
            });
            if (error) throw new Error(data?.error || error.message || "Não foi possível iniciar o pagamento.");
            if (data?.error) throw new Error(data.error);
            return data;
        },

        async verifyPayment(payload) {
            const client = getClient();
            const { data, error } = await client.functions.invoke("verify-infinitepay-payment", {
                body: payload
            });
            if (error) throw new Error(data?.error || error.message || "Não foi possível verificar o pagamento.");
            if (data?.error) throw new Error(data.error);
            return data;
        }
    };

    const authApi = {
        async signIn(email, password) {
            const client = getClient();
            return throwIfError(await client.auth.signInWithPassword({ email, password }));
        },

        async signUp({ email, password, fullName, phone }) {
            const client = getClient();
            return throwIfError(await client.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: String(fullName || "").trim(),
                        phone: normalizePhone(phone)
                    }
                }
            }));
        },

        async resetPassword(email, redirectTo) {
            const client = getClient();
            return throwIfError(await client.auth.resetPasswordForEmail(email, {
                redirectTo
            }));
        },

        async updatePassword(password) {
            const client = getClient();
            return throwIfError(await client.auth.updateUser({ password }));
        },

        async signOut() {
            const client = getClient();
            return throwIfError(await client.auth.signOut());
        },

        async getSession() {
            const client = getClient();
            const data = throwIfError(await client.auth.getSession());
            return data.session;
        },

        async getUser() {
            const client = getClient();
            const data = throwIfError(await client.auth.getUser());
            return data.user;
        },

        async getProfile(userId) {
            const client = getClient();
            return throwIfError(await client
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .maybeSingle());
        },

        async requireAdmin() {
            const user = await this.getUser();
            if (!user) throw new Error("Sessão não encontrada.");

            const profile = await this.getProfile(user.id);
            if (!profile || !profile.active || !["admin", "barber"].includes(profile.role)) {
                throw new Error("Acesso não autorizado.");
            }

            return { user, profile };
        },

        async requireCustomer() {
            const user = await this.getUser();
            if (!user) throw new Error("Faça login para continuar.");

            const profile = await this.getProfile(user.id);
            if (!profile || !profile.active) {
                throw new Error("Esta conta não está disponível.");
            }

            return { user, profile };
        }
    };

    const customerApi = {
        async syncProfile(payload) {
            const client = getClient();
            const data = throwIfError(await client.rpc("sync_own_customer_profile", {
                p_full_name: String(payload.fullName || "").trim(),
                p_phone: normalizePhone(payload.phone),
                p_nickname: String(payload.nickname || "").trim() || null,
                p_birth_date: payload.birthDate || null,
                p_style_preferences: String(payload.stylePreferences || "").trim() || null
            }));
            return Array.isArray(data) ? data[0] : data;
        },

        async getCustomer() {
            const client = getClient();
            return throwIfError(await client
                .from("customers")
                .select("*")
                .maybeSingle());
        },

        async getAppointments() {
            const client = getClient();
            return throwIfError(await client
                .from("appointments")
                .select(`
                    *,
                    services(id, name, duration_minutes, price)
                `)
                .order("starts_at", { ascending: false }));
        },

        async getSubscriptions() {
            const client = getClient();
            return throwIfError(await client
                .from("subscriptions")
                .select(`
                    *,
                    plans(id, name, description, price, billing_cycle, cuts_included)
                `)
                .order("created_at", { ascending: false }));
        },

        async getPlans() {
            const client = getClient();
            return throwIfError(await client
                .from("plans")
                .select("*")
                .eq("active", true)
                .order("price", { ascending: true }));
        },

        async getSubscriptionRequests() {
            const client = getClient();
            return throwIfError(await client
                .from("subscription_requests")
                .select(`
                    *,
                    plans(id, name, description, price, billing_cycle, cuts_included)
                `)
                .order("requested_at", { ascending: false }));
        },

        async requestSubscription(planId, paymentChoice) {
            const client = getClient();
            const data = throwIfError(await client.rpc("create_subscription_request", {
                p_plan_id: planId,
                p_payment_choice: paymentChoice
            }));
            return Array.isArray(data) ? data[0] : data;
        },

        async getOverview() {
            const { user, profile } = await authApi.requireCustomer();
            const client = getClient();
            let customer = await this.getCustomer();

            // Contas antigas podiam possuir profile correto, mas nenhum registro vinculado
            // em customers. Depois da migração 010, esta chamada repara o vínculo sozinha.
            if (!customer) {
                const profileName = String(profile?.full_name || user?.user_metadata?.full_name || "").trim();
                const profilePhone = normalizePhone(profile?.phone || user?.user_metadata?.phone || "");
                if (profileName.length >= 3 && utils?.isValidBrazilPhone(profilePhone)) {
                    customer = await this.syncProfile({
                        fullName: profileName,
                        phone: profilePhone
                    });
                }
            }

            const [appointments, subscriptions, plans, subscriptionRequests, settingsResult] = await Promise.all([
                this.getAppointments(),
                this.getSubscriptions(),
                this.getPlans(),
                this.getSubscriptionRequests(),
                client.from("settings").select("online_payments_enabled, subscription_sales_enabled").limit(1).maybeSingle()
            ]);
            if (settingsResult.error) throw settingsResult.error;

            return {
                user,
                profile,
                customer,
                appointments: appointments || [],
                subscriptions: subscriptions || [],
                plans: plans || [],
                subscriptionRequests: subscriptionRequests || [],
                settings: settingsResult.data || {}
            };
        },

        async cancelAppointment(id) {
            const client = getClient();
            const data = throwIfError(await client.rpc("cancel_own_appointment", {
                p_appointment_id: id
            }));
            return Array.isArray(data) ? data[0] : data;
        }
    };

    const adminApi = {
        async getDashboard(dateString = new Date().toISOString().slice(0, 10)) {
            const client = getClient();
            const { start, end } = localDateRange(dateString);
            const monthStart = `${dateString.slice(0, 7)}-01T00:00:00`;
            const monthEndDate = new Date(`${monthStart}`);
            monthEndDate.setMonth(monthEndDate.getMonth() + 1);

            const [
                appointmentsResult,
                todayCountResult,
                customersCountResult,
                monthMovementsResult,
                subscriptionRequestsResult
            ] = await Promise.all([
                client
                    .from("appointments")
                    .select(`
                        *,
                        services(id, name, duration_minutes),
                        customers(id, name, nickname, phone, email, style_preferences)
                    `)
                    .gte("starts_at", start)
                    .lte("starts_at", end)
                    .order("starts_at", { ascending: true }),
                client
                    .from("appointments")
                    .select("id", { count: "exact", head: true })
                    .gte("starts_at", start)
                    .lte("starts_at", end)
                    .in("status", ["pending", "confirmed", "completed"]),
                client
                    .from("customers")
                    .select("id", { count: "exact", head: true }),
                client
                    .from("cash_movements")
                    .select("type, amount")
                    .gte("movement_date", monthStart.slice(0, 10))
                    .lt("movement_date", monthEndDate.toISOString().slice(0, 10)),
                client
                    .from("subscription_requests")
                    .select("id, amount", { count: "exact" })
                    .eq("status", "pending_approval")
            ]);

            [appointmentsResult, todayCountResult, customersCountResult, monthMovementsResult, subscriptionRequestsResult]
                .forEach(({ error }) => { if (error) throw error; });

            const monthBalance = (monthMovementsResult.data || []).reduce((total, movement) => {
                const value = Number(movement.amount || 0);
                return total + (movement.type === "expense" ? -value : value);
            }, 0);

            return {
                appointments: appointmentsResult.data || [],
                todayCount: todayCountResult.count || 0,
                customersCount: customersCountResult.count || 0,
                monthBalance,
                pendingSubscriptionCount: subscriptionRequestsResult.count || 0,
                pendingSubscriptionValue: (subscriptionRequestsResult.data || []).reduce((total, item) => total + Number(item.amount || 0), 0)
            };
        },

        async getAppointments({ date, status = "", search = "" } = {}) {
            const client = getClient();
            let query = client
                .from("appointments")
                .select(`
                    *,
                    services(id, name, duration_minutes, price),
                    customers(id, name, nickname, phone, email, birth_date, style_preferences, notes)
                `)
                .order("starts_at", { ascending: true });

            if (date) {
                const { start, end } = localDateRange(date);
                query = query.gte("starts_at", start).lte("starts_at", end);
            }

            if (status) query = query.eq("status", status);
            const data = throwIfError(await query);

            if (!search) return data;
            const term = search.toLowerCase();
            return data.filter((appointment) => {
                const customer = appointment.customers || {};
                const service = appointment.services || {};
                return [customer.name, customer.nickname, customer.phone, customer.email, service.name, customer.style_preferences]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(term));
            });
        },

        async updateAppointment(id, changes) {
            const client = getClient();
            const appointment = throwIfError(await client
                .from("appointments")
                .update(changes)
                .eq("id", id)
                .select(`
                    *,
                    services(id, name, duration_minutes, price),
                    customers(id, name, nickname, phone, email, style_preferences)
                `)
                .single());

            if (Object.prototype.hasOwnProperty.call(changes, "payment_status")
                || Object.prototype.hasOwnProperty.call(changes, "payment_method")) {
                const paymentChanges = {};
                if (Object.prototype.hasOwnProperty.call(changes, "payment_status")) {
                    paymentChanges.status = changes.payment_status;
                    paymentChanges.paid_at = changes.payment_status === "paid" ? new Date().toISOString() : null;
                }
                if (Object.prototype.hasOwnProperty.call(changes, "payment_method")) {
                    paymentChanges.method = changes.payment_method || null;
                }
                const paymentResult = await client.from("payments").update(paymentChanges).eq("appointment_id", id);
                if (paymentResult.error) throw paymentResult.error;
            }

            return appointment;
        },

        async createManualAppointment(payload) {
            const client = getClient();
            const customer = throwIfError(await client
                .from("customers")
                .upsert({
                    name: payload.customerName,
                    phone: normalizePhone(payload.customerPhone),
                    email: payload.customerEmail || null,
                    notes: payload.customerNotes || null
                }, { onConflict: "phone" })
                .select()
                .single());

            const service = throwIfError(await client
                .from("services")
                .select("*")
                .eq("id", payload.serviceId)
                .single());

            const startsAt = new Date(payload.startsAt);
            const endsAt = new Date(startsAt.getTime() + Number(service.duration_minutes) * 60000);

            return throwIfError(await client
                .from("appointments")
                .insert({
                    customer_id: customer.id,
                    service_id: service.id,
                    starts_at: startsAt.toISOString(),
                    ends_at: endsAt.toISOString(),
                    status: payload.status || "confirmed",
                    source: "admin",
                    notes: payload.notes || null,
                    total_amount: service.price,
                    payment_status: payload.paymentStatus || "unpaid",
                    payment_method: payload.paymentMethod || null
                })
                .select()
                .single());
        },

        async getCustomers(search = "") {
            const client = getClient();
            let query = client
                .from("customers")
                .select(`
                    *,
                    appointments(
                        id,
                        starts_at,
                        status,
                        total_amount,
                        services(name)
                    )
                `)
                .order("name", { ascending: true });

            if (search) {
                query = query.or(`name.ilike.%${search}%,nickname.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
            }

            return throwIfError(await query);
        },

        async saveCustomer(payload) {
            const client = getClient();
            const values = {
                name: payload.name,
                nickname: payload.nickname || null,
                phone: normalizePhone(payload.phone),
                email: payload.email || null,
                birth_date: payload.birth_date || null,
                style_preferences: payload.style_preferences || null,
                notes: payload.notes || null
            };

            if (payload.id) {
                return throwIfError(await client
                    .from("customers")
                    .update(values)
                    .eq("id", payload.id)
                    .select()
                    .single());
            }

            return throwIfError(await client
                .from("customers")
                .insert(values)
                .select()
                .single());
        },

        async getServices() {
            const client = getClient();
            return throwIfError(await client
                .from("services")
                .select("*")
                .order("position", { ascending: true })
                .order("name", { ascending: true }));
        },

        async saveService(payload) {
            const client = getClient();
            const values = {
                name: payload.name,
                slug: payload.slug,
                description: payload.description || null,
                duration_minutes: Number(payload.duration_minutes),
                price: Number(payload.price),
                active: Boolean(payload.active),
                featured: Boolean(payload.featured),
                position: Number(payload.position || 0),
                icon_path: payload.icon_path || null
            };

            if (payload.id) {
                return throwIfError(await client
                    .from("services")
                    .update(values)
                    .eq("id", payload.id)
                    .select()
                    .single());
            }

            return throwIfError(await client
                .from("services")
                .insert(values)
                .select()
                .single());
        },

        async deleteService(id) {
            const client = getClient();
            return throwIfError(await client.from("services").delete().eq("id", id));
        },

        async getProducts() {
            const client = getClient();
            return throwIfError(await client
                .from("products")
                .select("*")
                .order("position", { ascending: true })
                .order("name", { ascending: true }));
        },

        async saveProduct(payload) {
            const client = getClient();
            const values = {
                name: payload.name,
                slug: payload.slug,
                category: payload.category,
                description: payload.description || null,
                details: payload.details || null,
                price: Number(payload.price),
                active: Boolean(payload.active),
                featured: Boolean(payload.featured),
                stock_status: payload.stock_status,
                image_url: payload.image_url || null,
                position: Number(payload.position || 0)
            };

            if (payload.id) {
                return throwIfError(await client
                    .from("products")
                    .update(values)
                    .eq("id", payload.id)
                    .select()
                    .single());
            }

            return throwIfError(await client
                .from("products")
                .insert(values)
                .select()
                .single());
        },

        async deleteProduct(id) {
            const client = getClient();
            return throwIfError(await client.from("products").delete().eq("id", id));
        },

        async uploadProductImage(file) {
            const client = getClient();
            const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const path = `products/${crypto.randomUUID()}.${extension}`;

            throwIfError(await client.storage
                .from(backend.storageBucket)
                .upload(path, file, { cacheControl: "3600", upsert: false }));

            return client.storage.from(backend.storageBucket).getPublicUrl(path).data.publicUrl;
        },

        async getCashMovements({ startDate, endDate } = {}) {
            const client = getClient();
            let query = client
                .from("cash_movements")
                .select("*")
                .order("movement_date", { ascending: false })
                .order("created_at", { ascending: false });

            if (startDate) query = query.gte("movement_date", startDate);
            if (endDate) query = query.lte("movement_date", endDate);
            return throwIfError(await query);
        },

        async getFinanceOverview({ startDate, endDate } = {}) {
            const client = getClient();
            const startIso = startDate ? `${startDate}T00:00:00` : null;
            const endIso = endDate ? `${endDate}T23:59:59.999` : null;

            let appointmentsQuery = client
                .from("appointments")
                .select("id, starts_at, status, total_amount, payment_status, payment_method, billing_mode, customers(name), services(name)")
                .neq("status", "cancelled");
            let paymentsQuery = client
                .from("payments")
                .select("id, amount, status, paid_at, method, provider, appointment_id, subscription_id")
                .eq("status", "paid");
            if (startIso) appointmentsQuery = appointmentsQuery.gte("starts_at", startIso);
            if (endIso) appointmentsQuery = appointmentsQuery.lte("starts_at", endIso);
            if (startIso) paymentsQuery = paymentsQuery.gte("paid_at", startIso);
            if (endIso) paymentsQuery = paymentsQuery.lte("paid_at", endIso);

            const [movements, appointmentsResult, paymentsResult, subscriptionsResult, requestsResult] = await Promise.all([
                this.getCashMovements({ startDate, endDate }),
                appointmentsQuery,
                paymentsQuery,
                client.from("subscriptions")
                    .select("id, status, remaining_uses, ends_on, plans(name, price), customers(name)")
                    .eq("status", "active")
                    .or(`ends_on.is.null,ends_on.gte.${new Date().toISOString().slice(0, 10)}`),
                client.from("subscription_requests").select("id, status, amount, payment_choice, customers(name), plans(name)").in("status", ["pending_approval", "pending_payment"])
            ]);
            [appointmentsResult, paymentsResult, subscriptionsResult, requestsResult].forEach(({ error }) => { if (error) throw error; });
            return {
                movements: movements || [],
                appointments: appointmentsResult.data || [],
                payments: paymentsResult.data || [],
                subscriptions: subscriptionsResult.data || [],
                requests: requestsResult.data || []
            };
        },

        async saveCashMovement(payload) {
            const client = getClient();
            return throwIfError(await client
                .from("cash_movements")
                .insert({
                    type: payload.type,
                    category: payload.category,
                    description: payload.description,
                    amount: Number(payload.amount),
                    movement_date: payload.movement_date,
                    payment_method: payload.payment_method || null,
                    appointment_id: payload.appointment_id || null
                })
                .select()
                .single());
        },

        async deleteCashMovement(id) {
            const client = getClient();
            return throwIfError(await client.from("cash_movements").delete().eq("id", id));
        },

        async getPlans() {
            const client = getClient();
            return throwIfError(await client
                .from("plans")
                .select("*")
                .order("active", { ascending: false })
                .order("price", { ascending: true }));
        },

        async savePlan(payload) {
            const client = getClient();
            const values = {
                name: payload.name,
                description: payload.description || null,
                price: Number(payload.price),
                billing_cycle: payload.billing_cycle,
                cuts_included: Number(payload.cuts_included || 0),
                active: Boolean(payload.active)
            };

            if (payload.id) {
                return throwIfError(await client
                    .from("plans")
                    .update(values)
                    .eq("id", payload.id)
                    .select()
                    .single());
            }

            return throwIfError(await client.from("plans").insert(values).select().single());
        },

        async getSubscriptions() {
            const client = getClient();
            return throwIfError(await client
                .from("subscriptions")
                .select(`
                    *,
                    customers(id, name, phone),
                    plans(id, name, price, cuts_included)
                `)
                .order("created_at", { ascending: false }));
        },

        async getSubscriptionRequests(status = "") {
            const client = getClient();
            let query = client
                .from("subscription_requests")
                .select(`
                    *,
                    customers(id, name, nickname, phone, email),
                    plans(id, name, price, cuts_included)
                `)
                .order("requested_at", { ascending: false });
            if (status) query = query.eq("status", status);
            return throwIfError(await query);
        },

        async reviewSubscriptionRequest(id, approve, note = "") {
            const client = getClient();
            const data = throwIfError(await client.rpc("review_subscription_request", {
                p_request_id: id,
                p_approve: Boolean(approve),
                p_note: note || null
            }));
            return Array.isArray(data) ? data[0] : data;
        },

        async saveSubscription(payload) {
            const client = getClient();
            const values = {
                customer_id: payload.customer_id,
                plan_id: payload.plan_id,
                starts_on: payload.starts_on,
                ends_on: payload.ends_on || null,
                status: payload.status,
                remaining_uses: Number(payload.remaining_uses || 0)
            };

            if (payload.id) {
                return throwIfError(await client
                    .from("subscriptions")
                    .update(values)
                    .eq("id", payload.id)
                    .select()
                    .single());
            }

            return throwIfError(await client.from("subscriptions").insert(values).select().single());
        },

        async updateSubscription(id, changes) {
            const client = getClient();
            return throwIfError(await client
                .from("subscriptions")
                .update(changes)
                .eq("id", id)
                .select()
                .single());
        },

        async getBusinessHours() {
            const client = getClient();
            return throwIfError(await client
                .from("business_hours")
                .select("*")
                .order("weekday", { ascending: true }));
        },

        async saveBusinessHours(rows) {
            const client = getClient();
            return throwIfError(await client
                .from("business_hours")
                .upsert(rows, { onConflict: "weekday" })
                .select());
        },

        async getBlockedPeriods() {
            const client = getClient();
            return throwIfError(await client
                .from("blocked_periods")
                .select("*")
                .gte("ends_at", new Date().toISOString())
                .order("starts_at", { ascending: true }));
        },

        async saveBlockedPeriod(payload) {
            const client = getClient();
            return throwIfError(await client
                .from("blocked_periods")
                .insert({
                    starts_at: payload.starts_at,
                    ends_at: payload.ends_at,
                    reason: payload.reason || null,
                    all_day: Boolean(payload.all_day)
                })
                .select()
                .single());
        },

        async deleteBlockedPeriod(id) {
            const client = getClient();
            return throwIfError(await client.from("blocked_periods").delete().eq("id", id));
        },

        async getSettings() {
            const client = getClient();
            return throwIfError(await client
                .from("settings")
                .select("*")
                .limit(1)
                .single());
        },

        async saveSettings(payload) {
            const client = getClient();
            return throwIfError(await client
                .from("settings")
                .update(payload)
                .eq("id", payload.id)
                .select()
                .single());
        }
    };

    window.DuAmigoAPI = Object.freeze({
        public: Object.freeze(publicApi),
        auth: Object.freeze(authApi),
        customer: Object.freeze(customerApi),
        admin: Object.freeze(adminApi),
        helpers: Object.freeze({ normalizePhone, localDateRange })
    });
})();
