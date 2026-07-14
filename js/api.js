"use strict";

(() => {
    const backend = window.DuAmigoBackend;

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

    const normalizePhone = (value = "") => value.replace(/\D/g, "").slice(-11);

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
            const data = throwIfError(await client.rpc("create_public_appointment", {
                p_service_id: payload.serviceId,
                p_starts_at: payload.startsAt,
                p_customer_name: payload.customerName,
                p_customer_phone: normalizePhone(payload.customerPhone),
                p_customer_email: payload.customerEmail || null,
                p_notes: payload.notes || null
            }));
            return Array.isArray(data) ? data[0] : data;
        }
    };

    const authApi = {
        async signIn(email, password) {
            const client = getClient();
            return throwIfError(await client.auth.signInWithPassword({ email, password }));
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
                monthMovementsResult
            ] = await Promise.all([
                client
                    .from("appointments")
                    .select(`
                        *,
                        services(id, name, duration_minutes),
                        customers(id, name, phone, email)
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
                    .lt("movement_date", monthEndDate.toISOString().slice(0, 10))
            ]);

            [appointmentsResult, todayCountResult, customersCountResult, monthMovementsResult]
                .forEach(({ error }) => { if (error) throw error; });

            const monthBalance = (monthMovementsResult.data || []).reduce((total, movement) => {
                const value = Number(movement.amount || 0);
                return total + (movement.type === "expense" ? -value : value);
            }, 0);

            return {
                appointments: appointmentsResult.data || [],
                todayCount: todayCountResult.count || 0,
                customersCount: customersCountResult.count || 0,
                monthBalance
            };
        },

        async getAppointments({ date, status = "", search = "" } = {}) {
            const client = getClient();
            let query = client
                .from("appointments")
                .select(`
                    *,
                    services(id, name, duration_minutes, price),
                    customers(id, name, phone, email, notes)
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
                return [customer.name, customer.phone, customer.email, service.name]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(term));
            });
        },

        async updateAppointment(id, changes) {
            const client = getClient();
            return throwIfError(await client
                .from("appointments")
                .update(changes)
                .eq("id", id)
                .select(`
                    *,
                    services(id, name, duration_minutes, price),
                    customers(id, name, phone, email)
                `)
                .single());
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
                query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
            }

            return throwIfError(await query);
        },

        async saveCustomer(payload) {
            const client = getClient();
            const values = {
                name: payload.name,
                phone: normalizePhone(payload.phone),
                email: payload.email || null,
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
        admin: Object.freeze(adminApi),
        helpers: Object.freeze({ normalizePhone, localDateRange })
    });
})();
